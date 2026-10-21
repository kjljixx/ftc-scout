import { PUBLIC_SERVER_ORIGIN, PUBLIC_FRONTEND_CODE } from "$env/static/public";
import {
    ApolloLink,
    HttpLink,
    ApolloClient,
    type HttpOptions,
    type NormalizedCacheObject,
    InMemoryCache,
    split,
} from "@apollo/client/core";
import { setContext } from "@apollo/client/link/context";
import { onError } from "@apollo/client/link/error";
import { forgetTeam, getTeamToken } from "$lib/team/team-store";
import { IS_DEV } from "../constants";
import { browser } from "$app/environment";
import { DESCRIPTORS_LIST } from "@ftc-scout/common";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createPersistedQueryLink } from "@apollo/client/link/persisted-queries";
import { createClient, type Client } from "graphql-ws";
import { getMainDefinition } from "@apollo/client/utilities";
import { sha256 } from "crypto-hash";

let client: ApolloClient<NormalizedCacheObject> | null = null;
let wsClient: Client | null = null;

const TEAM_TOKEN_HEADER = "x-team-token";

const teamHeaderLink = setContext((_, { headers }) => {
    let token = getTeamToken();
    return token ? { headers: { ...headers, [TEAM_TOKEN_HEADER]: token } } : {};
});

const unknownTeamLink = onError(({ graphQLErrors }) => {
    if (graphQLErrors?.some((e) => e.extensions?.code == "UNKNOWN_TEAM")) {
        forgetTeam("server does not know this team link");
    }
});

export function resetSubscriptionConnection() {
    wsClient?.terminate();
}

const SPARSELY_FETCHED_TYPES = DESCRIPTORS_LIST.flatMap((d) => {
    let variants = d.hasRemote ? ["Trad", "Remote"] : [""];
    return [
        `MatchScores${d.season}Alliance`,
        ...variants.flatMap((v) => [
            `MatchScores${d.season}${v}`,
            `TeamEventStats${d.season}${v}Group`,
            `TeamEventStats${d.season}${v}StdErrGroup`,
        ]),
    ];
});

export function getClient(
    fetch?: NonNullable<HttpOptions["fetch"]>
): ApolloClient<NormalizedCacheObject> {
    if (client) return client;
    if (!fetch) throw "First call to get client must provide fetch";

    let s = IS_DEV ? "" : "s";

    let httpLink = new HttpLink({
        uri: `${
            PUBLIC_SERVER_ORIGIN.startsWith("http")
                ? PUBLIC_SERVER_ORIGIN
                : `http${s}://${PUBLIC_SERVER_ORIGIN}`
        }/graphql`,
        credentials: "omit",
        headers: { [PUBLIC_FRONTEND_CODE!]: "." },
        fetch,
    });

    if (browser) {
        wsClient = createClient({
            url: `${
                PUBLIC_SERVER_ORIGIN.startsWith("http")
                    ? `wss://${PUBLIC_SERVER_ORIGIN.split("://")[1]}`
                    : `ws${s}://${PUBLIC_SERVER_ORIGIN}`
            }/graphql`,
            connectionParams: () => {
                let token = getTeamToken();
                return token ? { teamToken: token } : {};
            },
        });
    }

    let link = wsClient
        ? split(
              ({ query }) => {
                  let definition = getMainDefinition(query);
                  return (
                      definition.kind == "OperationDefinition" &&
                      definition.operation == "subscription"
                  );
              },
              new GraphQLWsLink(wsClient),
              httpLink
          )
        : httpLink;

    const linkChain = ApolloLink.from([
        unknownTeamLink,
        teamHeaderLink,
        createPersistedQueryLink({ sha256, useGETForHashedQueries: true }),
        link,
    ]);

    let cache = new InMemoryCache({
        possibleTypes: {
            TeamEventStats: DESCRIPTORS_LIST.flatMap((d) => {
                let base = `TeamEventStats${d.season}`;
                return d.hasRemote ? [base + "Trad", base + "Remote"] : [base];
            }),
            MatchScores: DESCRIPTORS_LIST.flatMap((d) => {
                let base = `MatchScores${d.season}`;
                return d.hasRemote ? [base + "Trad", base + "Remote"] : [base];
            }),
        },
        typePolicies: {
            Team: { keyFields: ["number"] },
            Event: { keyFields: ["season", "code"] },
            Match: { keyFields: ["season", "eventCode", "id"] },
            TeamMatchParticipation: {
                keyFields: ["season", "eventCode", "matchId", "station", "alliance"],
            },
            TeamEventParticipation: {
                keyFields: ["season", "eventCode", "teamNumber"],
                fields: {
                    stats: {
                        merge(existing, incoming, { mergeObjects }) {
                            return mergeObjects(existing, incoming);
                        },
                    },
                },
            },
            Award: { keyFields: ["season", "eventCode", "type", "placement", "teamNumber"] },
            Location: {
                merge(existing, incoming, { mergeObjects }) {
                    return mergeObjects(existing, incoming);
                },
            },
            ...Object.fromEntries(SPARSELY_FETCHED_TYPES.map((type) => [type, { merge: true }])),
        },
    });

    let newClient = new ApolloClient({
        connectToDevTools: IS_DEV,
        link: linkChain,
        cache,
    });

    // Don't cache the client on the server
    if (browser) {
        client = newClient;
    }

    return newClient;
}
