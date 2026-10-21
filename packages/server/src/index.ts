process.setMaxListeners(0);
import "dotenv/config";
import { DATA_SOURCE } from "./db/data-source";
import { initDynamicEntities } from "./db/entities/dyn/init";
import express, { text } from "express";
import cors from "cors";
import compression from "compression";
import { apiLoggerMiddleware } from "./db/entities/ApiReq";
import { SERVER_PORT, SYNC_API } from "./constants";
import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import { expressMiddleware } from "@apollo/server/express4";
import { GQL_SCHEMA } from "./graphql/schema";
import { GQLContext, buildContext } from "./graphql/context";
import { fetchPriorSeasons, watchApi } from "./ftc-api/watch";
import { setupBannerRoutes } from "./banner";
import { handleAnalytics } from "./analytics";
import { setupRest } from "./rest/setupRest";
import { setupDuels } from "./game/duel";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { setupSiteMap } from "./sitemap/setupSitemap";
import { InMemoryLRUCache } from "@apollo/utils.keyvaluecache";
import { responseCachePlugin } from "./graphql/plugins/response-cache-plugin";
import { timingPlugin } from "./graphql/plugins/timing-plugin";

async function main() {
    await DATA_SOURCE.initialize();
    initDynamicEntities();

    let app = express();

    app.use(
        // Allow requests from our webpage.
        cors({
            // origin: "*",
            origin: true,
            credentials: false,
        }),
        compression(),
        express.json()
    );

    let httpServer = createServer(app);
    let wsServer = new WebSocketServer({ noServer: true });
    httpServer.on("upgrade", (req, socket, head) => {
        if (new URL(req.url ?? "", "http://localhost").pathname !== "/graphql") return;
        wsServer.handleUpgrade(req, socket, head, (ws) => wsServer.emit("connection", ws, req));
    });

    const serverCleanup = useServer(
        {
            schema: GQL_SCHEMA,
            context: (ctx) =>
                buildContext(ctx.extra.request, (ctx.connectionParams as any)?.teamToken),
        },
        wsServer
    );
    console.info("[picklist] team tokens read from the x-team-token header / teamToken ws param");

    // Create shared cache for both APQ and response caching
    const serverCache = new InMemoryLRUCache({
        maxSize: Math.pow(2, 20) * 100, // ~100MiB
        ttl: 120, // Default 2 minutes for APQ
    });

    let apolloServer = new ApolloServer<GQLContext>({
        introspection: true,
        schema: GQL_SCHEMA,
        cache: serverCache,
        persistedQueries: {
            ttl: 60 * 60 * 24 * 14, // 2 weeks
            cache: serverCache,
        },
        plugins: [
            ApolloServerPluginLandingPageLocalDefault({
                footer: false,
                embed: { runTelemetry: false, endpointIsEditable: false },
            }),
            timingPlugin(),
            responseCachePlugin(serverCache),
            ApolloServerPluginDrainHttpServer({ httpServer }),
            {
                async serverWillStart() {
                    return {
                        async drainServer() {
                            await serverCleanup.dispose();
                        },
                    };
                },
            },
        ],
    });

    await apolloServer.start();

    app.use(
        "/graphql",
        apiLoggerMiddleware,
        expressMiddleware(apolloServer, {
            context: ({ req }) => buildContext(req, req.headers["x-team-token"]),
        })
    );

    app.post("/analytics", text(), handleAnalytics);

    setupRest(app);
    setupDuels(httpServer);
    setupSiteMap(app);

    setupBannerRoutes(app);

    httpServer.listen(SERVER_PORT, () => {
        console.info(`Server started and listening on port ${SERVER_PORT}.`);
    });

    if (SYNC_API) {
        await fetchPriorSeasons();
        await watchApi();
    }
}

main();
