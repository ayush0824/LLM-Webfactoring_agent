import { AsyncLocalStorage } from "node:async_hooks";
import type { Client } from "@libsql/client";

interface QueryCountStore {
	queryCount: number;
}

const queryCountStorage = new AsyncLocalStorage<QueryCountStore>();
const instrumentedClients = new WeakSet<Client>();
let testClientPromise: Promise<Client> | undefined;

function getTestClient(): Promise<Client> {
	testClientPromise ??= import("../src/db").then((dbModule) => {
		const testDbModule = dbModule as typeof dbModule & { client: Client };
		return testDbModule.client;
	});
	return testClientPromise;
}

function instrumentClient(client: Client): void {
	if (instrumentedClients.has(client)) {
		return;
	}

	const execute = client.execute.bind(client);
	client.execute = ((...args: Parameters<Client["execute"]>) => {
		const store = queryCountStorage.getStore();
		if (store) {
			store.queryCount += 1;
		}
		return execute(...args);
	}) as Client["execute"];
	instrumentedClients.add(client);
}

/** Count actual client executions for one operation without production-global state. */
export async function countSqlQueries<T>(operation: () => Promise<T>): Promise<{
	result: T;
	queryCount: number;
}> {
	const client = await getTestClient();
	instrumentClient(client);

	const store = { queryCount: 0 };
	const result = await queryCountStorage.run(store, operation);
	return { result, queryCount: store.queryCount };
}
