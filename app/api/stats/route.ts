import { route } from "@/lib/http.ts";
import { platformStats } from "@/lib/queries.ts";

export const GET = route(async () => platformStats());
