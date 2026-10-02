import type { ApolloServerPlugin } from "@apollo/server";

const SLOW_REQUEST_MS = 250;
const SERVER_TIMING_FIELDS = 5;

// Concurrent calls often wait on the same batched query, so we report the elapsed span
// (first call start to last call end) rather than summing each call's wait.
type FieldTiming = { calls: number; firstStartMs: number; lastEndMs: number };

function spanMs(t: FieldTiming): number {
    return t.lastEndMs - t.firstStartMs;
}

function round(ms: number): number {
    return Math.round(ms * 10) / 10;
}

export function timingPlugin(): ApolloServerPlugin {
    console.log(
        `[TIMING PLUGIN] Initialized: slow request threshold=${SLOW_REQUEST_MS}ms, ` +
            `Server-Timing fields=${SERVER_TIMING_FIELDS}`
    );

    return {
        async requestDidStart() {
            let startMs = performance.now();
            let executionStartMs: number | null = null;
            let fieldTimings = new Map<string, FieldTiming>();

            return {
                async executionDidStart() {
                    executionStartMs = performance.now();

                    return {
                        willResolveField({ info }) {
                            let hasCustomResolver =
                                !!info.parentType.getFields()[info.fieldName].resolve;
                            if (!hasCustomResolver) return;

                            let fieldStartMs = performance.now();
                            return () => {
                                let fieldEndMs = performance.now();
                                let name = `${info.parentType.name}.${info.fieldName}`;
                                let timing = fieldTimings.get(name);
                                if (!timing) {
                                    fieldTimings.set(name, {
                                        calls: 1,
                                        firstStartMs: fieldStartMs,
                                        lastEndMs: fieldEndMs,
                                    });
                                    return;
                                }
                                timing.calls += 1;
                                timing.firstStartMs = Math.min(timing.firstStartMs, fieldStartMs);
                                timing.lastEndMs = Math.max(timing.lastEndMs, fieldEndMs);
                            };
                        },
                    };
                },

                async willSendResponse(requestContext) {
                    let endMs = performance.now();
                    let totalMs = endMs - startMs;
                    let operation = requestContext.operationName ?? "anonymous";
                    let headers = requestContext.response.http?.headers;
                    let cacheStatus = headers?.get("x-cache") ?? "NONE";
                    let preExecutionMs =
                        executionStartMs === null ? null : executionStartMs - startMs;
                    let executionMs = executionStartMs === null ? null : endMs - executionStartMs;

                    let slowestFields = [...fieldTimings.entries()]
                        .sort((a, b) => spanMs(b[1]) - spanMs(a[1]))
                        .slice(0, SERVER_TIMING_FIELDS);

                    let serverTiming = [
                        `total;dur=${round(totalMs)}`,
                        `cache;desc=${cacheStatus}`,
                        ...(preExecutionMs === null
                            ? []
                            : [
                                  `pre;dur=${round(preExecutionMs)}`,
                                  `exec;dur=${round(executionMs!)}`,
                              ]),
                        ...slowestFields.map(
                            ([name, t]) => `${name.replace(".", "_")};dur=${round(spanMs(t))}`
                        ),
                    ].join(", ");
                    headers?.set("server-timing", serverTiming);
                    headers?.set("timing-allow-origin", "*");

                    if (totalMs < SLOW_REQUEST_MS) return;

                    let fieldSummary = slowestFields
                        .map(([name, t]) => `${name}=${round(spanMs(t))}ms(x${t.calls})`)
                        .join(" ");
                    console.log(
                        `[SLOW GQL] ${operation} total=${round(totalMs)}ms cache=${cacheStatus} ` +
                            `pre=${preExecutionMs === null ? "n/a" : round(preExecutionMs)}ms ` +
                            `exec=${
                                executionMs === null ? "n/a" : round(executionMs)
                            }ms ${fieldSummary}`
                    );
                },
            };
        },
    };
}
