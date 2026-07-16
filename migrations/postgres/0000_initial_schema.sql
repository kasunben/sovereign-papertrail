CREATE TABLE "papertrail_boards" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "papertrail_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"board_id" text NOT NULL,
	"source" text NOT NULL,
	"target" text NOT NULL,
	"data" text,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "papertrail_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"board_id" text NOT NULL,
	"type" text NOT NULL,
	"data" text NOT NULL,
	"position" text NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "papertrail_project_members" (
	"project_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"invited_by" text,
	"joined_at" integer NOT NULL,
	CONSTRAINT "papertrail_project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "papertrail_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived_at" integer,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "papertrail_boards_project_idx" ON "papertrail_boards" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "papertrail_edges_board_idx" ON "papertrail_edges" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "papertrail_nodes_board_idx" ON "papertrail_nodes" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "papertrail_project_members_project_idx" ON "papertrail_project_members" USING btree ("project_id");