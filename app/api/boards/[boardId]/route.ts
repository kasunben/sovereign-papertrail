import { and, eq } from 'drizzle-orm';
import { papertrailBoards, papertrailEdges, papertrailNodes } from '../../../_db/schema';
import { type Db, getRequestContext, requireProjectRole } from '../../../_lib/access';
import { validateEdge, validateNode } from '../../../_lib/snapshot';

interface RouteParams {
  params: Promise<{ boardId: string }>;
}

function now() {
  return Math.floor(Date.now() / 1000);
}

async function loadBoard(db: Db, tenantId: string, boardId: string) {
  const rows = await db
    .select()
    .from(papertrailBoards)
    .where(and(eq(papertrailBoards.tenantId, tenantId), eq(papertrailBoards.id, boardId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * GET/PUT /papertrail/api/boards/:boardId — whole-board snapshot read/replace
 * (PTR-11/12). PUT replaces every node/edge for the board per request via
 * sequential delete-then-insert, deliberately **not** `db.transaction()` —
 * better-sqlite3 rejects an async transaction callback at runtime
 * ("Transaction function cannot return a promise") even though
 * `db.transaction(async (tx) => ...)` type-checks fine against the SDK's
 * opaque client type; sovereign-plainwrite hit the same issue and documents
 * it in `actions-sync-transaction.test.ts`. A version mismatch returns 409 —
 * PTR-12 owns the client-side conflict-recovery UI, this route only
 * enforces the check.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { boardId } = await params;
  const { db, userId, tenantId } = await getRequestContext();

  const board = await loadBoard(db, tenantId, boardId);
  if (!board) return Response.json({ error: 'Board not found.' }, { status: 404 });

  try {
    await requireProjectRole(db, tenantId, board.projectId, userId, 'viewer');
  } catch {
    return Response.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const [nodeRows, edgeRows] = await Promise.all([
    db
      .select()
      .from(papertrailNodes)
      .where(and(eq(papertrailNodes.tenantId, tenantId), eq(papertrailNodes.boardId, boardId))),
    db
      .select()
      .from(papertrailEdges)
      .where(and(eq(papertrailEdges.tenantId, tenantId), eq(papertrailEdges.boardId, boardId))),
  ]);

  return Response.json({
    version: board.version,
    nodes: nodeRows.map((row) => ({
      id: row.id,
      type: row.type,
      position: JSON.parse(row.position) as unknown,
      data: JSON.parse(row.data) as unknown,
    })),
    edges: edgeRows.map((row) => ({
      id: row.id,
      source: row.source,
      target: row.target,
      data: row.data ? (JSON.parse(row.data) as unknown) : null,
    })),
  });
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { boardId } = await params;
  const { db, userId, tenantId } = await getRequestContext();

  const board = await loadBoard(db, tenantId, boardId);
  if (!board) return Response.json({ error: 'Board not found.' }, { status: 404 });

  try {
    await requireProjectRole(db, tenantId, board.projectId, userId, 'editor');
  } catch {
    return Response.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { version?: unknown; nodes?: unknown; edges?: unknown }
    | null;
  if (!body || typeof body.version !== 'number' || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
    return Response.json({ error: 'Invalid snapshot payload.' }, { status: 400 });
  }

  if (body.version !== board.version) {
    return Response.json({ error: 'This board changed elsewhere.', version: board.version }, { status: 409 });
  }

  const validNodes = body.nodes.map(validateNode).filter((node) => node !== null);
  const nodeIds = new Set(validNodes.map((node) => node.id));
  const validEdges = body.edges.map((edge) => validateEdge(edge, nodeIds)).filter((edge) => edge !== null);

  const ts = now();

  await db
    .delete(papertrailNodes)
    .where(and(eq(papertrailNodes.tenantId, tenantId), eq(papertrailNodes.boardId, boardId)));
  await db
    .delete(papertrailEdges)
    .where(and(eq(papertrailEdges.tenantId, tenantId), eq(papertrailEdges.boardId, boardId)));

  if (validNodes.length > 0) {
    await db.insert(papertrailNodes).values(
      validNodes.map((node) => ({
        id: node.id,
        tenantId,
        boardId,
        type: node.type,
        data: JSON.stringify(node.data),
        position: JSON.stringify(node.position),
        createdAt: ts,
        updatedAt: ts,
      })),
    );
  }

  if (validEdges.length > 0) {
    await db.insert(papertrailEdges).values(
      validEdges.map((edge) => ({
        id: edge.id,
        tenantId,
        boardId,
        source: edge.source,
        target: edge.target,
        data: edge.data ? JSON.stringify(edge.data) : null,
        createdAt: ts,
        updatedAt: ts,
      })),
    );
  }

  const nextVersion = board.version + 1;
  await db
    .update(papertrailBoards)
    .set({ version: nextVersion, updatedAt: ts })
    .where(and(eq(papertrailBoards.tenantId, tenantId), eq(papertrailBoards.id, boardId)));

  return Response.json({ version: nextVersion });
}
