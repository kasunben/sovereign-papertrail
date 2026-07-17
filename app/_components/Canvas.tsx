'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { MenuEntry, StatusBadgeStatus } from '@sovereignfs/ui';
import { StatusBadge } from '@sovereignfs/ui';
import { AddLinkDialog } from './AddLinkDialog';
import { ContextMenu, type ContextMenuPosition } from './ContextMenu';
import { DEFAULT_EDGE_STYLE, EdgeEditor, type EdgeCurveType, type EdgeStyleContent } from './EdgeEditor';
import { OverlayToolbar } from './OverlayToolbar';
import { ImageNode, type ImageFlowNode, type ImageNodeContent } from './nodes/ImageNode';
import { LinkNode, type LinkFlowNode, type LinkNodeContent } from './nodes/LinkNode';
import { TextNode, type TextFlowNode, type TextNodeContent } from './nodes/TextNode';
import { matchingNodeIds } from '../_lib/search';
import {
  fetchBoardSnapshot,
  readCachedSnapshot,
  useBoardSync,
  writeCachedSnapshot,
  type BoardSnapshot,
  type SyncStatus,
} from '../_lib/sync';
import styles from './Canvas.module.css';

export type CanvasMode = 'select' | 'connect';

interface Props {
  projectId: string;
  boardId: string;
  canEdit: boolean;
}

type CanvasNode = TextFlowNode | ImageFlowNode | LinkFlowNode;

// Defined once at module scope — React Flow expects a stable nodeTypes
// reference, not a fresh object literal every render.
const nodeTypes = { text: TextNode, image: ImageNode, link: LinkNode };

let textNodeSeq = 0;
let imageNodeSeq = 0;
let linkNodeSeq = 0;

interface NodeMenuState {
  position: ContextMenuPosition;
  nodeId: string;
}

interface EdgeMenuState {
  position: ContextMenuPosition;
  edgeId: string;
}

function edgeFieldsFromStyle(content: EdgeStyleContent): Partial<Edge> {
  return {
    label: content.label || undefined,
    type: content.curveType,
    animated: content.animated,
    style: {
      stroke: content.color,
      strokeWidth: content.width,
      strokeDasharray: content.lineStyle === 'dashed' ? '6 4' : undefined,
    },
  };
}

function edgeStyleFromEdge(edge: Edge): EdgeStyleContent {
  const style = (edge.style ?? {}) as {
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
  };
  return {
    label: typeof edge.label === 'string' ? edge.label : DEFAULT_EDGE_STYLE.label,
    color: style.stroke ?? DEFAULT_EDGE_STYLE.color,
    width: style.strokeWidth ?? DEFAULT_EDGE_STYLE.width,
    lineStyle: style.strokeDasharray ? 'dashed' : 'solid',
    curveType: (edge.type as EdgeCurveType | undefined) ?? DEFAULT_EDGE_STYLE.curveType,
    animated: edge.animated ?? DEFAULT_EDGE_STYLE.animated,
  };
}

interface RawNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface RawEdge {
  id: string;
  source: string;
  target: string;
  data: Record<string, unknown> | null;
}

/** Reattaches the live onSave callback a text node needs — everything else round-trips as plain data. */
function hydrateNode(
  raw: RawNode,
  canEdit: boolean,
  patchTextNode: (nodeId: string, patch: TextNodeContent) => void,
): CanvasNode | null {
  if (raw.type === 'text') {
    const data = raw.data as Partial<TextNodeContent>;
    return {
      id: raw.id,
      type: 'text',
      position: raw.position,
      data: {
        title: data.title ?? '',
        body: data.body ?? '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        editable: canEdit,
        onSave: (patch) => patchTextNode(raw.id, patch),
      },
    };
  }
  if (raw.type === 'image') {
    const data = raw.data as { url: string; thumbnailUrl: string; width: number; height: number };
    return { id: raw.id, type: 'image', position: raw.position, data: { status: 'ready', ...data } };
  }
  if (raw.type === 'link') {
    const data = raw.data as { url: string; title: string | null; description: string | null; image: string | null };
    return { id: raw.id, type: 'link', position: raw.position, data: { status: 'ready', ...data } };
  }
  return null;
}

function hydrateEdge(raw: RawEdge): Edge {
  const content: EdgeStyleContent = { ...DEFAULT_EDGE_STYLE, ...(raw.data as Partial<EdgeStyleContent> | null) };
  return { id: raw.id, source: raw.source, target: raw.target, ...edgeFieldsFromStyle(content) };
}

/** Only 'ready' image/link nodes are worth persisting — an in-flight upload/fetch or a failed one is ephemeral UI state, not board content. */
function toSnapshotNode(node: CanvasNode): RawNode | null {
  if (node.type === 'text') {
    return {
      id: node.id,
      type: 'text',
      position: node.position,
      data: { title: node.data.title, body: node.data.body, tags: node.data.tags },
    };
  }
  if (node.type === 'image') {
    if (node.data.status !== 'ready') return null;
    const { url, thumbnailUrl, width, height } = node.data;
    return { id: node.id, type: 'image', position: node.position, data: { url, thumbnailUrl, width, height } };
  }
  if (node.data.status !== 'ready') return null;
  const { url, title, description, image } = node.data;
  return { id: node.id, type: 'link', position: node.position, data: { url, title, description, image } };
}

function toSnapshotEdge(edge: Edge): RawEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    data: edgeStyleFromEdge(edge) as unknown as Record<string, unknown>,
  };
}

const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  pending: 'Unsaved changes',
  offline: 'Offline — will sync when reconnected',
};

const SYNC_STATUS_BADGE: Record<SyncStatus, StatusBadgeStatus> = {
  idle: 'unmodified',
  saving: 'unmodified',
  saved: 'unmodified',
  pending: 'conflict',
  offline: 'conflict',
};

/**
 * Canvas skeleton (PTR-05) + text/image/link nodes (PTR-06–08) + edge
 * styling (PTR-09) + search (PTR-10) + offline-first sync (PTR-11): the
 * board loads from the localStorage cache first for an instant paint, then
 * reconciles against the server snapshot; every subsequent node/edge change
 * re-caches immediately and schedules a debounced (~1.2s) save, retried on
 * reconnect if it fails. A 409 version conflict is treated as a save
 * failure for now — it parks as "pending" and keeps retrying rather than
 * reloading the newer state first; PTR-12 adds that reload-and-recover flow
 * on top of `useBoardSync`'s `conflict` flag.
 */
function CanvasInner({ projectId, boardId, canEdit }: Props) {
  const [mode, setMode] = useState<CanvasMode>('select');
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { screenToFlowPosition } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePosition = useRef<{ x: number; y: number } | null>(null);
  const pendingLinkPosition = useRef<{ x: number; y: number } | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const [paneMenu, setPaneMenu] = useState<ContextMenuPosition | null>(null);
  const [nodeMenu, setNodeMenu] = useState<NodeMenuState | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<EdgeMenuState | null>(null);
  const [edgeEditor, setEdgeEditor] = useState<EdgeMenuState | null>(null);

  const [version, setVersion] = useState(0);
  // Guards every nodes/edges React state update that *we* cause (the
  // initial empty state, the cache hydration, the network hydration)
  // against re-triggering the save-effect below — each is set true
  // immediately before its setNodes/setEdges call and consumed (reset to
  // false) the next time the save-effect runs, so only a genuine
  // user-driven change ever reaches it. Starts true because the very first
  // mount render (nodes=[]) must not schedule a save either.
  const skipNextSaveRef = useRef(true);

  const patchTextNodeRef = useRef<(nodeId: string, patch: TextNodeContent) => void>(() => {});

  useEffect(() => {
    let cancelled = false;

    const cached = readCachedSnapshot(boardId);
    if (cached) {
      skipNextSaveRef.current = true;
      setNodes(
        cached.nodes
          .map((n) => hydrateNode(n as RawNode, canEdit, (id, patch) => patchTextNodeRef.current(id, patch)))
          .filter((n): n is CanvasNode => n !== null),
      );
      setEdges(cached.edges.map((e) => hydrateEdge(e as RawEdge)));
      setVersion(cached.version);
    }

    fetchBoardSnapshot(boardId)
      .then((snapshot) => {
        if (cancelled) return;
        skipNextSaveRef.current = true;
        setNodes(
          snapshot.nodes
            .map((n) => hydrateNode(n as RawNode, canEdit, (id, patch) => patchTextNodeRef.current(id, patch)))
            .filter((n): n is CanvasNode => n !== null),
        );
        setEdges(snapshot.edges.map((e) => hydrateEdge(e as RawEdge)));
        setVersion(snapshot.version);
        writeCachedSnapshot(boardId, snapshot);
      })
      .catch(() => {
        // offline or the request failed — keep whatever the cache already gave us
      });

    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const getSnapshot = useCallback(
    (): BoardSnapshot => ({
      version,
      nodes: nodes.map(toSnapshotNode).filter((n): n is RawNode => n !== null),
      edges: edges.map(toSnapshotEdge),
    }),
    [nodes, edges, version],
  );

  const handleVersionChange = useCallback((nextVersion: number) => {
    // A successful save bumps `version`, which changes getSnapshot's
    // identity and would otherwise re-trigger the save-effect below for no
    // reason (same content, no user edit) — skip that one too.
    skipNextSaveRef.current = true;
    setVersion(nextVersion);
  }, []);

  const { status: syncStatus, scheduleSave } = useBoardSync({
    boardId,
    canEdit,
    getSnapshot,
    onVersionChange: handleVersionChange,
  });

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    writeCachedSnapshot(boardId, getSnapshot());
    scheduleSave();
  }, [nodes, edges, boardId, getSnapshot, scheduleSave]);

  const [searchQuery, setSearchQuery] = useState('');
  const [hideNonMatches, setHideNonMatches] = useState(false);
  const hasActiveSearch = searchQuery.trim().length > 0;
  const matchedNodeIds = useMemo(() => matchingNodeIds(nodes, searchQuery), [nodes, searchQuery]);
  const applyHiding = hasActiveSearch && hideNonMatches;
  const displayNodes = useMemo(
    () => (applyHiding ? nodes.map((n) => (matchedNodeIds.has(n.id) ? n : { ...n, hidden: true })) : nodes),
    [nodes, applyHiding, matchedNodeIds],
  );
  const displayEdges = useMemo(
    () =>
      applyHiding
        ? edges.map((e) =>
            matchedNodeIds.has(e.source) && matchedNodeIds.has(e.target) ? e : { ...e, hidden: true },
          )
        : edges,
    [edges, applyHiding, matchedNodeIds],
  );

  const closeMenus = useCallback(() => {
    setPaneMenu(null);
    setNodeMenu(null);
    setEdgeMenu(null);
    setEdgeEditor(null);
  }, []);

  const patchTextNode = useCallback(
    (nodeId: string, patch: TextNodeContent) => {
      setNodes((current) =>
        current.map((n) => (n.id === nodeId && n.type === 'text' ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [setNodes],
  );
  patchTextNodeRef.current = patchTextNode;

  const patchImageNode = useCallback(
    (nodeId: string, patch: ImageNodeContent) => {
      setNodes((current) =>
        current.map((n) => (n.id === nodeId && n.type === 'image' ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [setNodes],
  );

  const patchLinkNode = useCallback(
    (nodeId: string, patch: Partial<LinkNodeContent>) => {
      setNodes((current) =>
        current.map((n) => (n.id === nodeId && n.type === 'link' ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [setNodes],
  );

  const addTextNodeAt = useCallback(
    (flowPosition: { x: number; y: number }) => {
      if (!canEdit) return;
      textNodeSeq += 1;
      const id = `text-${Date.now()}-${textNodeSeq}`;
      const node: TextFlowNode = {
        id,
        type: 'text',
        position: flowPosition,
        data: {
          title: '',
          body: '',
          tags: [],
          editable: canEdit,
          onSave: (patch) => patchTextNode(id, patch),
        },
      };
      setNodes((current) => [...current, node]);
    },
    [canEdit, setNodes, patchTextNode],
  );

  const uploadImageAt = useCallback(
    async (flowPosition: { x: number; y: number }, file: File) => {
      if (!canEdit) return;
      imageNodeSeq += 1;
      const id = `image-${Date.now()}-${imageNodeSeq}`;
      const node: ImageFlowNode = {
        id,
        type: 'image',
        position: flowPosition,
        data: { status: 'uploading' },
      };
      setNodes((current) => [...current, node]);

      try {
        const formData = new FormData();
        formData.set('projectId', projectId);
        formData.set('file', file);
        const response = await fetch('/papertrail/api/assets', { method: 'POST', body: formData });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? 'Upload failed.');
        }
        const result = (await response.json()) as {
          url: string;
          thumbnailUrl: string;
          width: number;
          height: number;
        };
        patchImageNode(id, { status: 'ready', ...result });
      } catch (err) {
        patchImageNode(id, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed.' });
      }
    },
    [canEdit, projectId, setNodes, patchImageNode],
  );

  function triggerImageUpload(flowPosition: { x: number; y: number }) {
    pendingImagePosition.current = flowPosition;
    fileInputRef.current?.click();
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const position = pendingImagePosition.current ?? screenToFlowPosition({ x: 0, y: 0 });
    void uploadImageAt(position, file);
  }

  const addLinkNodeAt = useCallback(
    async (flowPosition: { x: number; y: number }, url: string) => {
      if (!canEdit) return;
      linkNodeSeq += 1;
      const id = `link-${Date.now()}-${linkNodeSeq}`;
      const node: LinkFlowNode = {
        id,
        type: 'link',
        position: flowPosition,
        data: { status: 'loading', url },
      };
      setNodes((current) => [...current, node]);

      try {
        const response = await fetch(`/papertrail/api/preview?url=${encodeURIComponent(url)}`);
        const body = (await response.json()) as {
          title?: string | null;
          description?: string | null;
          image?: string | null;
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? 'Could not fetch a preview.');
        patchLinkNode(id, {
          status: 'ready',
          title: body.title ?? null,
          description: body.description ?? null,
          image: body.image ?? null,
        });
      } catch (err) {
        patchLinkNode(id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Could not fetch a preview.',
        });
      }
    },
    [canEdit, setNodes, patchLinkNode],
  );

  function triggerAddLink(flowPosition: { x: number; y: number }) {
    pendingLinkPosition.current = flowPosition;
    setLinkDialogOpen(true);
  }

  function handleLinkDialogSubmit(url: string) {
    const position = pendingLinkPosition.current ?? screenToFlowPosition({ x: 0, y: 0 });
    void addLinkNodeAt(position, url);
  }

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!canEdit) return;
      setEdges((current) => {
        const next = addEdge(connection, current);
        const added = next[next.length - 1];
        if (!added) return next;
        return next.map((e) => (e.id === added.id ? { ...e, ...edgeFieldsFromStyle(DEFAULT_EDGE_STYLE) } : e));
      });
    },
    [canEdit, setEdges],
  );

  const patchEdgeStyle = useCallback(
    (edgeId: string, content: EdgeStyleContent) => {
      setEdges((current) => current.map((e) => (e.id === edgeId ? { ...e, ...edgeFieldsFromStyle(content) } : e)));
    },
    [setEdges],
  );

  const onPaneContextMenu = useCallback(
    (event: ReactMouseEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      closeMenus();
      setPaneMenu({ x: event.clientX, y: event.clientY });
    },
    [closeMenus],
  );

  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (event, node) => {
      event.preventDefault();
      closeMenus();
      setNodeMenu({ position: { x: event.clientX, y: event.clientY }, nodeId: node.id });
    },
    [closeMenus],
  );

  const onEdgeContextMenu: EdgeMouseHandler = useCallback(
    (event, edge) => {
      event.preventDefault();
      closeMenus();
      setEdgeMenu({ position: { x: event.clientX, y: event.clientY }, edgeId: edge.id });
    },
    [closeMenus],
  );

  const paneMenuItems: MenuEntry[] = canEdit
    ? [
        {
          label: 'Add text node here',
          onSelect: () => {
            if (!paneMenu) return;
            addTextNodeAt(screenToFlowPosition(paneMenu));
            setPaneMenu(null);
          },
        },
        {
          label: 'Add image here',
          onSelect: () => {
            if (!paneMenu) return;
            triggerImageUpload(screenToFlowPosition(paneMenu));
            setPaneMenu(null);
          },
        },
        {
          label: 'Add link here',
          onSelect: () => {
            if (!paneMenu) return;
            triggerAddLink(screenToFlowPosition(paneMenu));
            setPaneMenu(null);
          },
        },
      ]
    : [];

  const nodeMenuItems: MenuEntry[] = canEdit
    ? [
        {
          label: 'Delete node',
          destructive: true,
          onSelect: () => {
            if (!nodeMenu) return;
            const { nodeId } = nodeMenu;
            setNodes((current) => current.filter((n) => n.id !== nodeId));
            setEdges((current) => current.filter((e) => e.source !== nodeId && e.target !== nodeId));
            setNodeMenu(null);
          },
        },
      ]
    : [];

  const edgeMenuItems: MenuEntry[] = canEdit
    ? [
        {
          label: 'Edit style',
          onSelect: () => {
            if (!edgeMenu) return;
            setEdgeEditor(edgeMenu);
            setEdgeMenu(null);
          },
        },
        {
          label: 'Delete edge',
          destructive: true,
          onSelect: () => {
            if (!edgeMenu) return;
            const { edgeId } = edgeMenu;
            setEdges((current) => current.filter((e) => e.id !== edgeId));
            setEdgeMenu(null);
          },
        },
      ]
    : [];

  function viewportCenter() {
    return screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
  }

  const editingEdge = edgeEditor ? (edges.find((e) => e.id === edgeEditor.edgeId) ?? null) : null;

  return (
    <div className={styles.canvas}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className={styles.hiddenFileInput}
        onChange={handleFileInputChange}
      />
      <OverlayToolbar
        mode={mode}
        onModeChange={setMode}
        onAddTextNode={() => addTextNodeAt(viewportCenter())}
        onAddImage={() => triggerImageUpload(viewportCenter())}
        onAddLink={() => triggerAddLink(viewportCenter())}
        canEdit={canEdit}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        matchCount={matchedNodeIds.size}
        hideNonMatches={hideNonMatches}
        onHideNonMatchesChange={setHideNonMatches}
      />
      {canEdit && syncStatus !== 'idle' ? (
        <div className={styles.syncStatus}>
          <StatusBadge status={SYNC_STATUS_BADGE[syncStatus]}>{SYNC_STATUS_LABEL[syncStatus]}</StatusBadge>
        </div>
      ) : null}
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        onNodesChange={canEdit ? onNodesChange : undefined}
        onEdgesChange={canEdit ? onEdgesChange : undefined}
        onConnect={canEdit ? onConnect : undefined}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit && mode === 'connect'}
        elementsSelectable={canEdit}
        panOnDrag={mode === 'connect' ? true : [1, 2]}
        selectionOnDrag={mode === 'select'}
        multiSelectionKeyCode="Shift"
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneClick={closeMenus}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>

      <ContextMenu
        position={paneMenu}
        items={paneMenuItems}
        aria-label="Canvas actions"
        onClose={() => setPaneMenu(null)}
      />
      <ContextMenu
        position={nodeMenu?.position ?? null}
        items={nodeMenuItems}
        aria-label="Node actions"
        onClose={() => setNodeMenu(null)}
      />
      <ContextMenu
        position={edgeMenu?.position ?? null}
        items={edgeMenuItems}
        aria-label="Edge actions"
        onClose={() => setEdgeMenu(null)}
      />

      <AddLinkDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onSubmit={handleLinkDialogSubmit}
      />

      <EdgeEditor
        position={edgeEditor?.position ?? null}
        initial={editingEdge ? edgeStyleFromEdge(editingEdge) : null}
        onSave={(content) => {
          if (edgeEditor) patchEdgeStyle(edgeEditor.edgeId, content);
          setEdgeEditor(null);
        }}
        onClose={() => setEdgeEditor(null)}
      />
    </div>
  );
}

export function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
