import { GraphQLFieldConfig, GraphQLObjectType } from "graphql";
import { IntTy, listTy, StrTy, nn } from "@ftc-scout/common";
import { EventPicklist } from "../../db/entities/EventPicklist";
import { pubsub } from "./pubsub";

function picklistKey(season: number, eventCode: string) {
    return `PICKLIST-${season}-${eventCode}`;
}

const EventPicklistGQL = new GraphQLObjectType({
    name: "EventPicklist",
    fields: {
        season: IntTy,
        eventCode: StrTy,
        teamOrder: listTy(IntTy),
    },
});

export const EventPicklistQueries: Record<string, GraphQLFieldConfig<any, any>> = {
    eventPicklist: {
        type: EventPicklistGQL,
        args: { season: IntTy, eventCode: StrTy },
        resolve: (_, { season, eventCode }) => EventPicklist.findOneBy({ season, eventCode }),
    },
};

export const EventPicklistMutations: Record<string, GraphQLFieldConfig<any, any>> = {
    setEventPicklist: {
        type: nn(EventPicklistGQL),
        args: {
            season: IntTy,
            eventCode: StrTy,
            teamOrder: listTy(IntTy),
        },
        resolve: async (_, { season, eventCode, teamOrder }) => {
            let picklist = EventPicklist.create({ season, eventCode, teamOrder });
            await picklist.save();
            pubsub.publish(picklistKey(season, eventCode), { picklistUpdated: picklist });
            return picklist;
        },
    },
};

export const EventPicklistSubscriptions: Record<string, GraphQLFieldConfig<any, any>> = {
    picklistUpdated: {
        type: nn(EventPicklistGQL),
        args: { season: IntTy, eventCode: StrTy },
        subscribe: (_, { season, eventCode }) =>
            pubsub.asyncIterator(picklistKey(season, eventCode)),
    },
};
