import "dotenv/config";
import { db } from "./index";
import { posts, settings } from "./schema";

// Replace the bodies with your real stories. Blank line = new paragraph.
const rows = [
  { slug: "your-first-week", title: "Your First Week: What Nobody Tells You Before You Resume",
    body: "Write your story here.\n\nWhat you wish you knew on day one.\n\nThe three things to do before lectures even start." },
  { slug: "how-i-got-a-first-class", title: "How I’m Holding a First Class (And You Can Too)",
    body: "Your study system goes here.\n\nHow you plan your week.\n\nHow you prepare for exams." },
  { slug: "winning-a-scholarship", title: "How To Win a Scholarship in 100 Level",
    body: "How you got your scholarship.\n\nThe requirements most students miss.\n\nHow to stay on it." },
  { slug: "join-and-lead-associations", title: "Join, Then Lead: How I Became President of CS & MIS",
    body: "How you got into the association.\n\nHow you ran for president.\n\nHow to meet the right people." },
  { slug: "build-skills-that-pay", title: "Stop Collecting Certificates. Build Things That Pay.",
    body: "Your first project.\n\nHow you went from code to money.\n\nWhat to build in your first year." },
  { slug: "from-simple-code-to-millions", title: "From Student Project to Software That Processed Millions",
    body: "The full story.\n\nMistakes to avoid.\n\nThe numbers." },
  { slug: "leading-people-at-19", title: "How To Lead People Older Than You",
    body: "Leadership lessons.\n\nHandling conflict.\n\nDelegating." },
];

async function main() {
  await db.insert(posts).values(rows.map((r, i) => ({ ...r, position: i + 1 }))).onConflictDoNothing();
  await db.insert(settings).values({
    key: "PERSONAL_MESSAGE",
    value: "Dear 100 level student,\n\nYour first year is still in your hands. Do not waste it copying everyone else’s timetable, chasing certificates, or discovering in 400 level that results do not happen by accident.",
  }).onConflictDoNothing();
  await db.insert(settings).values({ key: "PROFILE_IMAGE", value: "" }).onConflictDoNothing();
  console.log("Seeded", rows.length, "posts (first 3 free).");
}
main();
