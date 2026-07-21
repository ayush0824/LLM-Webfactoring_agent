import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/session.server", () => ({
	getSessionData: vi.fn(),
}));

import { getGrpcSessionToken } from "../../../src/lib/grpc.server";
import { getSessionData } from "../../../src/lib/session.server";

describe("user gRPC authentication", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("forwards the exact API-issued token stored in the session", async () => {
		vi.mocked(getSessionData).mockResolvedValue({
			userId: "user-123",
			username: "alice",
			sessionToken: "api-issued-user-token",
		});

		expect(await getGrpcSessionToken()).toBe("api-issued-user-token");
	});
});
