import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  position: integer("position").notNull().unique(), // reading order: 1, 2, 3...
  title: text("title").notNull(),
  body: text("body").notNull(), // Markdown source
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  checkoutId: text("checkout_id").notNull().unique(),
  eventId: text("event_id").unique(),
  email: text("email"),
  amount: text("amount").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Post = typeof posts.$inferSelect;
