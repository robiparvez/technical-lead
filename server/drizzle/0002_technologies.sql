CREATE TABLE "technologies" (
	"slug" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"tags" text[] NOT NULL,
	"sort_order" integer NOT NULL
);
