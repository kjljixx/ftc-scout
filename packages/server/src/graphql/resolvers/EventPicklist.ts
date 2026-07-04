import { GraphQLFieldConfig, GraphQLObjectType, GraphQLScalarType } from "graphql";
import { IntTy, listTy, StrTy, nn, wr } from "@ftc-scout/common";
import { EventPicklist, CustomField } from "../../db/entities/EventPicklist";
import { pubsub } from "./pubsub";
import { randomUUID } from "crypto";

function picklistKey(season: number, eventCode: string) {
    return `PICKLIST-${season}-${eventCode}`;
}

const JSONScalar = new GraphQLScalarType({
    name: "JSON",
    serialize: (v) => v,
    parseValue: (v) => v,
    parseLiteral: () => {
        throw new Error("JSON literals not supported, use variables");
    },
});

const CustomFieldGQL = new GraphQLObjectType({
    name: "CustomField",
    fields: {
        id: StrTy,
        name: StrTy,
        type: StrTy,
    },
});

const CustomFieldValueGQL = new GraphQLObjectType({
    name: "CustomFieldValue",
    fields: {
        teamNumber: IntTy,
        fieldId: StrTy,
        value: wr(nn(JSONScalar)),
    },
});

function flattenValues(
    customValues: Record<string, Record<string, string | number | boolean>>
): { teamNumber: number; fieldId: string; value: string | number | boolean }[] {
    let out: { teamNumber: number; fieldId: string; value: string | number | boolean }[] = [];
    for (let [teamNumber, fields] of Object.entries(customValues ?? {})) {
        for (let [fieldId, value] of Object.entries(fields)) {
            out.push({ teamNumber: +teamNumber, fieldId, value });
        }
    }
    return out;
}

const EventPicklistGQL = new GraphQLObjectType({
    name: "EventPicklist",
    fields: {
        season: IntTy,
        eventCode: StrTy,
        teamOrder: listTy(IntTy),
        customFields: {
            type: listTy(wr(nn(CustomFieldGQL))).type,
            resolve: (p: EventPicklist) => p.customFields ?? [],
        },
        customValues: {
            type: listTy(wr(nn(CustomFieldValueGQL))).type,
            resolve: (p: EventPicklist) => flattenValues(p.customValues),
        },
    },
});

async function getOrCreatePicklist(season: number, eventCode: string): Promise<EventPicklist> {
    let picklist = await EventPicklist.findOneBy({ season, eventCode });
    if (!picklist) {
        picklist = EventPicklist.create({
            season,
            eventCode,
            teamOrder: [],
            customFields: [],
            customValues: {},
        });
    }
    if (!picklist.customFields) picklist.customFields = [];
    if (!picklist.customValues) picklist.customValues = {};
    return picklist;
}

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
            let picklist = await getOrCreatePicklist(season, eventCode);
            picklist.teamOrder = teamOrder;
            await picklist.save();
            pubsub.publish(picklistKey(season, eventCode), { picklistUpdated: picklist });
            return picklist;
        },
    },
    addCustomField: {
        type: nn(EventPicklistGQL),
        args: {
            season: IntTy,
            eventCode: StrTy,
            name: StrTy,
            fieldType: StrTy,
        },
        resolve: async (_, { season, eventCode, name, fieldType }) => {
            if (fieldType !== "string" && fieldType !== "float" && fieldType !== "boolean") {
                throw new Error(`Invalid field type: ${fieldType}`);
            }
            let picklist = await getOrCreatePicklist(season, eventCode);
            let field: CustomField = { id: randomUUID(), name, type: fieldType };
            picklist.customFields = [...picklist.customFields, field];
            await picklist.save();
            pubsub.publish(picklistKey(season, eventCode), { picklistUpdated: picklist });
            return picklist;
        },
    },
    removeCustomField: {
        type: nn(EventPicklistGQL),
        args: {
            season: IntTy,
            eventCode: StrTy,
            fieldId: StrTy,
        },
        resolve: async (_, { season, eventCode, fieldId }) => {
            let picklist = await getOrCreatePicklist(season, eventCode);
            picklist.customFields = picklist.customFields.filter((f) => f.id !== fieldId);
            let newValues: Record<string, Record<string, string | number | boolean>> = {};
            for (let [teamNumber, fields] of Object.entries(picklist.customValues)) {
                let { [fieldId]: _removed, ...rest } = fields;
                newValues[teamNumber] = rest;
            }
            picklist.customValues = newValues;
            await picklist.save();
            pubsub.publish(picklistKey(season, eventCode), { picklistUpdated: picklist });
            return picklist;
        },
    },
    setCustomFieldValue: {
        type: nn(EventPicklistGQL),
        args: {
            season: IntTy,
            eventCode: StrTy,
            teamNumber: IntTy,
            fieldId: StrTy,
            value: wr(nn(JSONScalar)),
        },
        resolve: async (_, { season, eventCode, teamNumber, fieldId, value }) => {
            let picklist = await getOrCreatePicklist(season, eventCode);
            let field = picklist.customFields.find((f) => f.id === fieldId);
            if (!field) throw new Error(`No such custom field: ${fieldId}`);

            let coerced: string | number | boolean =
                field.type === "float"
                    ? Number(value)
                    : field.type === "boolean"
                    ? Boolean(value)
                    : String(value);
            if (field.type === "float" && Number.isNaN(coerced as number)) {
                throw new Error(`Invalid float value: ${value}`);
            }

            picklist.customValues = {
                ...picklist.customValues,
                [teamNumber]: {
                    ...(picklist.customValues[teamNumber] ?? {}),
                    [fieldId]: coerced,
                },
            };
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
