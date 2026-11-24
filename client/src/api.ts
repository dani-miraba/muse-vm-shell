import type { Actions } from "../../server/src/actions";
import { createActionClient } from "@hatch/space-sdk/client";

export const api = createActionClient<typeof Actions>();

export type { ApiRequest, ApiResponse } from "@hatch/space-sdk/client";
