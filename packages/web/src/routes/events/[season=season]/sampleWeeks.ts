import type { EventsSearchEventFragment } from "$lib/graphql/generated/graphql-operations";
import { EventType } from "$lib/graphql/generated/graphql-operations";
import type { FuzzyResult } from "@ftc-scout/common";

type SampleEvent = FuzzyResult<NonNullable<EventsSearchEventFragment>>;

function sampleEvent(name: string, type: EventType, regionCode: string): SampleEvent {
    return {
        distance: 0,
        highlights: [],
        document: {
            __typename: "Event",
            season: 2025,
            code: "SAMPLE",
            name,
            remote: false,
            start: "2025-01-01",
            end: "2025-01-01",
            type,
            regionCode,
            hasMatches: true,
            location: { city: "City", state: "State", country: "USA" },
        },
    };
}

// Names are only here to give skullet realistic line lengths to measure.
export const SAMPLE_WEEKS: { weekNum: number; events: SampleEvent[] }[] = [
    {
        weekNum: 0,
        events: [
            sampleEvent("Northern Virginia League Meet 1", EventType.LeagueMeet, "USVA"),
            sampleEvent("Greater Pittsburgh Qualifier", EventType.Qualifier, "USPA"),
            sampleEvent("Silicon Valley Super Qualifier", EventType.SuperQualifier, "USCANO"),
            sampleEvent("Houston West League Meet 3", EventType.LeagueMeet, "USTXHO"),
        ],
    },
    {
        weekNum: 1,
        events: [
            sampleEvent("Ohio Qualifier", EventType.Qualifier, "USOH"),
            sampleEvent("Metro Detroit League Tournament", EventType.LeagueTournament, "USMI"),
            sampleEvent("North Carolina Championship", EventType.Championship, "USNC"),
        ],
    },
    {
        weekNum: 2,
        events: [
            sampleEvent("Ontario Provincial Championship", EventType.Championship, "CAON"),
            sampleEvent("Utah Qualifier", EventType.Qualifier, "USUT"),
            sampleEvent("Florida League Meet 2", EventType.LeagueMeet, "USFL"),
            sampleEvent("Texas Central League Tournament", EventType.LeagueTournament, "USTXCE"),
            sampleEvent("Georgia Super Qualifier", EventType.SuperQualifier, "USGA"),
        ],
    },
];
