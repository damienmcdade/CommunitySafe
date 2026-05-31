import "server-only";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../lib/http";

// Saved Places ("Alert Zones") — the places a user cares about (home, work, a
// relative's address). The proximity worker (apps/api) pushes a safety alert
// when a new incident appears within `radiusM`. CRUD lives here on the web side
// where the UI runs; the worker reads the same rows.

const MAX_PLACES = 12;
const MIN_RADIUS_M = 200;
const MAX_RADIUS_M = 5000;

export interface SavedPlaceInput {
  label: string;
  lat: number;
  lng: number;
  radiusM?: number;
}

function clampRadius(r: number | undefined): number {
  if (typeof r !== "number" || !Number.isFinite(r)) return 800;
  return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(r)));
}

export async function listSavedPlaces(userId: string) {
  return prisma.savedPlace.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, label: true, lat: true, lng: true, radiusM: true,
      alertsEnabled: true, lastAlertAt: true, createdAt: true,
    },
  });
}

export async function createSavedPlace(userId: string, input: SavedPlaceInput) {
  const label = input.label.trim().slice(0, 60);
  if (!label) throw new HttpError(400, "label_required", "Give the place a name.");
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) ||
      Math.abs(input.lat) > 90 || Math.abs(input.lng) > 180) {
    throw new HttpError(400, "invalid_coords", "That location doesn't look valid.");
  }
  const count = await prisma.savedPlace.count({ where: { userId } });
  if (count >= MAX_PLACES) {
    throw new HttpError(400, "too_many_places", `You can save up to ${MAX_PLACES} places.`);
  }
  return prisma.savedPlace.create({
    data: { userId, label, lat: input.lat, lng: input.lng, radiusM: clampRadius(input.radiusM) },
    select: { id: true, label: true, lat: true, lng: true, radiusM: true, alertsEnabled: true, lastAlertAt: true, createdAt: true },
  });
}

export async function updateSavedPlace(
  userId: string,
  id: string,
  patch: { label?: string; radiusM?: number; alertsEnabled?: boolean },
) {
  const place = await prisma.savedPlace.findFirst({ where: { id, userId }, select: { id: true } });
  if (!place) throw new HttpError(404, "not_found", "Place not found.");
  const data: { label?: string; radiusM?: number; alertsEnabled?: boolean } = {};
  if (typeof patch.label === "string") {
    const l = patch.label.trim().slice(0, 60);
    if (!l) throw new HttpError(400, "label_required", "Give the place a name.");
    data.label = l;
  }
  if (typeof patch.radiusM === "number") data.radiusM = clampRadius(patch.radiusM);
  if (typeof patch.alertsEnabled === "boolean") data.alertsEnabled = patch.alertsEnabled;
  return prisma.savedPlace.update({
    where: { id },
    data,
    select: { id: true, label: true, lat: true, lng: true, radiusM: true, alertsEnabled: true, lastAlertAt: true, createdAt: true },
  });
}

export async function deleteSavedPlace(userId: string, id: string) {
  const place = await prisma.savedPlace.findFirst({ where: { id, userId }, select: { id: true } });
  if (!place) throw new HttpError(404, "not_found", "Place not found.");
  await prisma.savedPlace.delete({ where: { id } });
  return { ok: true };
}
