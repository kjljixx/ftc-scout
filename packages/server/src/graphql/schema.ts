import { GraphQLObjectType, GraphQLSchema } from "graphql";
import { TeamQueries } from "./resolvers/Team";
import { EventQueries, EventSubscriptions } from "./resolvers/Event";
import { RecordQueries } from "./resolvers/records/Records";
import { HomeQueries } from "./resolvers/Home";
import { BestNameMutations, BestNameQueries } from "./resolvers/BestName";
import {
    EventPicklistMutations,
    EventPicklistQueries,
    EventPicklistSubscriptions,
} from "./resolvers/EventPicklist";

const query = new GraphQLObjectType({
    name: "Query",
    fields: {
        ...TeamQueries,
        ...EventQueries,
        ...RecordQueries,
        ...HomeQueries,
        ...BestNameQueries,
        ...EventPicklistQueries,
    },
});

const mutation = new GraphQLObjectType({
    name: "Mutation",
    fields: {
        ...BestNameMutations,
        ...EventPicklistMutations,
    },
});

const subscription = new GraphQLObjectType({
    name: "Subscription",
    fields: {
        ...EventSubscriptions,
        ...EventPicklistSubscriptions,
    },
});

export const GQL_SCHEMA = new GraphQLSchema({
    query,
    mutation,
    subscription,
});
