// The game's data every addon reads, pinned in one place (pins.json): the
// clients' builds on wago.tools and the community databases' commits.
// bin/latest.ts tells when the game has moved past them.
import { readFileSync } from "node:fs";
import path from "node:path";

export type Build = { product: string; build: string };
export type Repo = { repo: string; commit: string };
export type Pins = { builds: Record<Game, Build>; repos: Record<string, Repo> };
export type Game = "classic" | "forever";

export const ROOT = path.join(import.meta.dir, "..");
export const PINS_FILE = path.join(ROOT, "pins.json");
export const PINS: Pins = JSON.parse(readFileSync(PINS_FILE, "utf8"));
export const CLASSIC = PINS.builds.classic;
export const FOREVER = PINS.builds.forever;
export const REPOS = PINS.repos;
// a wago.tools table's query for a pinned build
export const wagoQuery = (b: Build) => `product=${b.product}&build=${b.build}`;
