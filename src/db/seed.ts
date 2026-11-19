import "dotenv/config";
import { gt, lte } from "drizzle-orm";
import { db } from "./index";
import { posts, settings } from "./schema";

// Replace the bodies with your real stories. Blank line = new paragraph.
const rows = [
  { slug: "your-first-week", topic: "Orientation & mindset", title: "Your First Week: What Nobody Tells You Before You Resume",
    hook: "The first 7 days set the tone for your entire year. Here’s how to use them.",
    body: "Write your story here.\n\nWhat you wish you knew on day one.\n\nThe three things to do before lectures even start." },
  { slug: "how-i-got-a-first-class", topic: "Grades & study system", title: "How I’m Holding a First Class (And You Can Too)",
    hook: "The exact study system, timetable and habits behind a first class run.",
    body: "Your study system goes here.\n\nHow you plan your week.\n\nHow you prepare for exams." },
  { slug: "winning-a-scholarship", topic: "Scholarships & money", title: "How To Win a Scholarship in 100 Level",
    hook: "What the scholarship committee actually looks at, and how to show it.",
    body: "How you got your scholarship.\n\nThe requirements most students miss.\n\nHow to stay on it." },
  { slug: "join-and-lead-associations", topic: "Student associations & network", title: "Join, Then Lead: How I Became President of CS & MIS",
    hook: "Your network is a grade nobody posts online. Build it early.",
    body: "How you got into the association.\n\nHow you ran for president.\n\nHow to meet the right people." },
  { slug: "build-skills-that-pay", topic: "Skills & building software", title: "Stop Collecting Certificates. Build Things That Pay.",
    hook: "How to turn what you learn in class into real software and real income.",
    body: "Your first project.\n\nHow you went from code to money.\n\nWhat to build in your first year." },
  { slug: "from-code-to-millions", topic: "Business", title: "From Student Project to Software That Made Millions",
    hook: "The full breakdown of how it was built, sold and scaled.",
    body: "The full story.\n\nMistakes to avoid.\n\nThe numbers." },
  { slug: "leading-people-at-19", topic: "Leadership", title: "How To Lead People Older Than You",
    hook: "Lessons from running a department-wide association.",
    body: "Leadership lessons.\n\nHandling conflict.\n\nDelegating." },
];

async function main() {
  await db.insert(posts).values(rows.map((r, i) => ({ ...r, position: i + 1, isFree: i < 3 }))).onConflictDoNothing();
  await db.update(posts).set({ isFree: false }).where(gt(posts.position, 3));
  await db.update(posts).set({ isFree: true }).where(lte(posts.position, 3));
  await db.insert(settings).values({ key: "ADMIN_PATH", value: "admin" }).onConflictDoNothing();
  await db.insert(settings).values({
    key: "PERSONAL_MESSAGE",
    value: "Dear 100 level student,\n\nYour first year is still in your hands. Do not waste it copying everyone else’s timetable, chasing certificates, or discovering in 400 level that results do not happen by accident.",
  }).onConflictDoNothing();
  await db.insert(settings).values({ key: "PROFILE_IMAGE", value: "" }).onConflictDoNothing();
  console.log("Seeded", rows.length, "posts (first 3 free).");
}
main();
