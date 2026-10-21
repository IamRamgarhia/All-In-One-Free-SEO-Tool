CREATE TABLE "audit_diffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"previous_audit_id" uuid,
	"current_audit_id" uuid NOT NULL,
	"fixed_rules" jsonb DEFAULT '[]'::jsonb,
	"regressed_rules" jsonb DEFAULT '[]'::jsonb,
	"new_issues" jsonb DEFAULT '[]'::jsonb,
	"worsened_rules" jsonb DEFAULT '[]'::jsonb,
	"score_delta" integer,
	"category_deltas" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_rule_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"status" text,
	"score" integer,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"source" text DEFAULT 'seomator' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"global_score" integer,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"raw_report" jsonb,
	"category_scores" jsonb,
	"error_message" text,
	"pages_crawled" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cabinet_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"issue_id" uuid,
	"title" text NOT NULL,
	"priority" text DEFAULT 'P2' NOT NULL,
	"effort" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"owner" text,
	"due_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cabinet_audit_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_run_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"category" text,
	"status" text,
	"severity" text,
	"title" text,
	"description" text,
	"recommendation" text,
	"affected_urls" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cabinet_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sector" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cabinet_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text,
	"url" text NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_diffs" ADD CONSTRAINT "audit_diffs_site_id_cabinet_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cabinet_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_diffs" ADD CONSTRAINT "audit_diffs_previous_audit_id_audit_runs_id_fk" FOREIGN KEY ("previous_audit_id") REFERENCES "public"."audit_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_diffs" ADD CONSTRAINT "audit_diffs_current_audit_id_audit_runs_id_fk" FOREIGN KEY ("current_audit_id") REFERENCES "public"."audit_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_rule_history" ADD CONSTRAINT "audit_rule_history_site_id_cabinet_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cabinet_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_rule_history" ADD CONSTRAINT "audit_rule_history_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_runs" ADD CONSTRAINT "audit_runs_site_id_cabinet_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cabinet_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet_actions" ADD CONSTRAINT "cabinet_actions_site_id_cabinet_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cabinet_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet_actions" ADD CONSTRAINT "cabinet_actions_issue_id_cabinet_audit_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."cabinet_audit_issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet_audit_issues" ADD CONSTRAINT "cabinet_audit_issues_audit_run_id_audit_runs_id_fk" FOREIGN KEY ("audit_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet_audit_issues" ADD CONSTRAINT "cabinet_audit_issues_site_id_cabinet_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."cabinet_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet_sites" ADD CONSTRAINT "cabinet_sites_client_id_cabinet_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."cabinet_clients"("id") ON DELETE cascade ON UPDATE no action;