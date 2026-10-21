import { GraphQLError, GraphQLFieldConfig, GraphQLObjectType, GraphQLScalarType } from "graphql";
import { IntTy, listTy, StrTy, nn, wr } from "@ftc-scout/common";
import { EventPicklist, CustomField } from "../../db/entities/EventPicklist";
import { pubsub } from "./pubsub";
import { randomUUID } from "crypto";
import { GQLContext, requirePicklistTeam } from "../context";

const MAX_TEAM_ORDER = 500;
const MAX_CUSTOM_FIELDS = 30;
const MAX_FIELD_NAME_LENGTH = 60;
const MAX_TEXT_VALUE_LENGTH = 500;

function picklistKey(teamTokenHash: string, season: number, eventCode: string) {
    return `PICKLIST-${teamTokenHash}-${season}-${eventCode}`;
}

function assertWithin(limit: number, actual: number, what: string) {
    if (actual > limit) {
        throw new GraphQLError(`Too many ${what} (limit ${limit})`, {
            extensions: { code: "LIMIT_EXCEEDED" },
        });
    }
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

async function getOrCreatePicklist(
    teamTokenHash: string,
    season: number,
    eventCode: string
): Promise<EventPicklist> {
    let picklist = await EventPicklist.findOneBy({ teamTokenHash, season, eventCode });
    if (!picklist) {
        picklist = EventPicklist.create({
            teamTokenHash,
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

async function savePicklist(picklist: EventPicklist) {
    await picklist.save();
    pubsub.publish(picklistKey(picklist.teamTokenHash, picklist.season, picklist.eventCode), {
        picklistUpdated: picklist,
    });
}

export const EventPicklistQueries: Record<string, GraphQLFieldConfig<any, GQLContext>> = {
    eventPicklist: {
        type: EventPicklistGQL,
        args: { season: IntTy, eventCode: StrTy },
        resolve: (_, { season, eventCode }, ctx) =>
            EventPicklist.findOneBy({
                teamTokenHash: requirePicklistTeam(ctx).tokenHash,
                season,
                eventCode,
            }),
    },
};

export const EventPicklistMutations: Record<string, GraphQLFieldConfig<any, GQLContext>> = {
    setEventPicklist: {
        type: nn(EventPicklistGQL),
        args: {
            season: IntTy,
            eventCode: StrTy,
            teamOrder: listTy(IntTy),
        },
        resolve: async (_, { season, eventCode, teamOrder }, ctx) => {
            assertWithin(MAX_TEAM_ORDER, teamOrder.length, "teams in the picklist");
            let picklist = await getOrCreatePicklist(
                requirePicklistTeam(ctx).tokenHash,
                season,
                eventCode
            );
            picklist.teamOrder = teamOrder;
            await savePicklist(picklist);
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
        resolve: async (_, { season, eventCode, name, fieldType }, ctx) => {
            if (fieldType !== "string" && fieldType !== "float" && fieldType !== "boolean") {
                throw new Error(`Invalid field type: ${fieldType}`);
            }
            assertWithin(MAX_FIELD_NAME_LENGTH, name.length, "characters in the field name");
            let picklist = await getOrCreatePicklist(
                requirePicklistTeam(ctx).tokenHash,
                season,
                eventCode
            );
            assertWithin(MAX_CUSTOM_FIELDS - 1, picklist.customFields.length, "custom fields");
            let field: CustomField = { id: randomUUID(), name, type: fieldType };
            picklist.customFields = [...picklist.customFields, field];
            await savePicklist(picklist);
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
        resolve: async (_, { season, eventCode, fieldId }, ctx) => {
            let picklist = await getOrCreatePicklist(
                requirePicklistTeam(ctx).tokenHash,
                season,
                eventCode
            );
            picklist.customFields = picklist.customFields.filter((f) => f.id !== fieldId);
            let newValues: Record<string, Record<string, string | number | boolean>> = {};
            for (let [teamNumber, fields] of Object.entries(picklist.customValues)) {
                let { [fieldId]: _removed, ...rest } = fields;
                newValues[teamNumber] = rest;
            }
            picklist.customValues = newValues;
            await savePicklist(picklist);
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
        resolve: async (_, { season, eventCode, teamNumber, fieldId, value }, ctx) => {
            let picklist = await getOrCreatePicklist(
                requirePicklistTeam(ctx).tokenHash,
                season,
                eventCode
            );
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
            if (typeof coerced == "string") {
                assertWithin(MAX_TEXT_VALUE_LENGTH, coerced.length, "characters in the value");
            }
            if (!(teamNumber in picklist.customValues)) {
                assertWithin(
                    MAX_TEAM_ORDER - 1,
                    Object.keys(picklist.customValues).length,
                    "teams with custom values"
                );
            }

            picklist.customValues = {
                ...picklist.customValues,
                [teamNumber]: {
                    ...(picklist.customValues[teamNumber] ?? {}),
                    [fieldId]: coerced,
                },
            };
            await savePicklist(picklist);
            return picklist;
        },
    },
};

export const EventPicklistSubscriptions: Record<string, GraphQLFieldConfig<any, GQLContext>> = {
    picklistUpdated: {
        type: nn(EventPicklistGQL),
        args: { season: IntTy, eventCode: StrTy },
        subscribe: (_, { season, eventCode }, ctx) =>
            pubsub.asyncIterator(
                picklistKey(requirePicklistTeam(ctx).tokenHash, season, eventCode)
            ),
    },
};
