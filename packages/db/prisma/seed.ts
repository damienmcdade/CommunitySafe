import { PrismaClient, AreaKind, CrimeCategory, PostKind, PostStatus } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

// fix(audit db-ssl-1): force verify-full whenever ANY sslmode is present (the
// old regex no-op'd on sslmode=disable / no sslmode).
function pinSslVerifyFull(url: string): string {
  if (!url) return url;
  return /sslmode=/i.test(url) ? url.replace(/sslmode=[^&\s]*/i, "sslmode=verify-full") : url;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: pinSslVerifyFull(process.env.DATABASE_URL ?? "") }),
});

const SD_NEIGHBORHOODS = [
  { slug: "pacific-beach",  name: "Pacific Beach",   centroidLat: 32.7997, centroidLng: -117.2358 },
  { slug: "hillcrest",      name: "Hillcrest",       centroidLat: 32.7484, centroidLng: -117.1641 },
  { slug: "downtown-sd",    name: "Downtown",        centroidLat: 32.7157, centroidLng: -117.1611 },
  { slug: "la-jolla",       name: "La Jolla",        centroidLat: 32.8328, centroidLng: -117.2713 },
  { slug: "mission-valley", name: "Mission Valley",  centroidLat: 32.7707, centroidLng: -117.1521 },
  { slug: "mira-mesa",      name: "Mira Mesa",       centroidLat: 32.9170, centroidLng: -117.1450 },
  { slug: "north-park",     name: "North Park",      centroidLat: 32.7396, centroidLng: -117.1294 },
];

const SD_JURISDICTIONS = [
  { slug: "san-diego",  name: "San Diego" },
  { slug: "chula-vista", name: "Chula Vista" },
  { slug: "la-mesa",     name: "La Mesa" },
  { slug: "el-cajon",    name: "El Cajon" },
];

async function main() {
  for (const j of SD_JURISDICTIONS) {
    await prisma.area.upsert({
      where: { slug: j.slug },
      update: {},
      create: { slug: j.slug, name: j.name, kind: AreaKind.JURISDICTION },
    });
  }

  for (const n of SD_NEIGHBORHOODS) {
    await prisma.area.upsert({
      where: { slug: n.slug },
      update: {},
      create: {
        slug: n.slug,
        name: n.name,
        kind: AreaKind.NEIGHBORHOOD,
        parentSlug: "san-diego",
        centroidLat: n.centroidLat,
        centroidLng: n.centroidLng,
      },
    });
  }

  // Sample demo user — used to render community feed in dev.
  // fix(audit db-seed-3): never seed a KNOWN-credential account into production.
  // In dev the fixed password keeps the demo convenient; in prod (or when
  // SEED_DEMO_PASSWORD is unset) use a random one so the account can't be logged
  // into with a guessable credential if the seed is ever run against prod.
  const demoPassword =
    process.env.SEED_DEMO_PASSWORD ??
    (process.env.NODE_ENV === "production"
      ? (await import("node:crypto")).randomBytes(24).toString("base64url")
      : "travelsafe-demo");
  const demoPasswordHash = await bcrypt.hash(demoPassword, 10);
  const demo = await prisma.user.upsert({
    where: { email: "demo@travelsafe.local" },
    update: {},
    create: {
      email: "demo@travelsafe.local",
      passwordHash: demoPasswordHash,
      displayName: "Demo User",
      alertPreference: {
        create: {
          categories: [CrimeCategory.PERSONS, CrimeCategory.PROPERTY],
          pushMinRiskLevel: 3,
        },
      },
    },
  });

  const pacificBeach = await prisma.area.findUnique({ where: { slug: "pacific-beach" } });
  if (pacificBeach) {
    const existing = await prisma.post.findFirst({
      where: { authorId: demo.id, areaId: pacificBeach.id },
    });
    if (!existing) {
      await prisma.post.create({
        data: {
          authorId: demo.id,
          areaId: pacificBeach.id,
          kind: PostKind.SAFETY_NOTICE,
          body: "Increased catalytic-converter theft reports in this area over the past week. Park in well-lit spots if possible.",
          status: PostStatus.VERIFIED,
          reviewedAt: new Date(),
          acknowledgement: {
            create: {
              userId: demo.id,
              acceptedText: "I confirm this report is truthful, first-hand or credible, and area-level.",
            },
          },
        },
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
