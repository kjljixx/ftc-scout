export type Slot = { from: number; kind: "winner" | "loser" } | null;

export type BracketSeries = {
    series: number;
    col: number;
    row: number;
    slots: [Slot, Slot];
};

export type BracketLayout = {
    series: BracketSeries[];
    finals: number;
    reset: number;
};

const winner = (from: number): Slot => ({ from, kind: "winner" });
const loser = (from: number): Slot => ({ from, kind: "loser" });
const seeded: [Slot, Slot] = [null, null];

const FINALS_STACK_OFFSET = 0.53;

function finals(series: number, row: number): BracketSeries[] {
    return [
        { series, col: 0, row: row - FINALS_STACK_OFFSET, slots: [null, null] },
        { series: series + 1, col: 0, row: row + FINALS_STACK_OFFSET, slots: [null, null] },
    ];
}

function withFinals(
    rest: BracketSeries[],
    finalsSeries: number,
    finalsCol: number,
    feeders: [number, number]
): BracketLayout {
    let rowOf = (s: number) => rest.find((r) => r.series == s)!.row;
    let middle = (rowOf(feeders[0]) + rowOf(feeders[1])) / 2;
    let [first, second] = finals(finalsSeries, middle);
    first.col = second.col = finalsCol;
    first.slots = [winner(feeders[0]), winner(feeders[1])];
    second.slots = [null, null];
    return {
        series: [...rest, first, second],
        finals: finalsSeries,
        reset: finalsSeries + 1,
    };
}

const FOUR_ALLIANCES = withFinals(
    [
        { series: 1, col: 0, row: 0, slots: seeded },
        { series: 2, col: 0, row: 1, slots: seeded },
        { series: 3, col: 1, row: 2.25, slots: [loser(1), loser(2)] },
        { series: 4, col: 1, row: 0.5, slots: [winner(1), winner(2)] },
        { series: 5, col: 2, row: 2.25, slots: [winner(3), loser(4)] },
    ],
    6,
    3,
    [4, 5]
);

const SIX_ALLIANCES = withFinals(
    [
        { series: 1, col: 0, row: 0, slots: seeded },
        { series: 2, col: 0, row: 1, slots: seeded },
        { series: 3, col: 1, row: 0, slots: [null, winner(1)] },
        { series: 4, col: 1, row: 1, slots: [null, winner(2)] },
        { series: 5, col: 2, row: 2.25, slots: [loser(3), loser(2)] },
        { series: 6, col: 2, row: 3.25, slots: [loser(4), loser(1)] },
        { series: 7, col: 2, row: 0.5, slots: [winner(3), winner(4)] },
        { series: 8, col: 3, row: 2.75, slots: [winner(5), winner(6)] },
        { series: 9, col: 4, row: 2.75, slots: [loser(7), winner(8)] },
    ],
    10,
    5,
    [7, 9]
);

const EIGHT_ALLIANCES = withFinals(
    [
        { series: 1, col: 0, row: 0, slots: seeded },
        { series: 2, col: 0, row: 1, slots: seeded },
        { series: 3, col: 0, row: 2, slots: seeded },
        { series: 4, col: 0, row: 3, slots: seeded },
        { series: 5, col: 1, row: 4.25, slots: [loser(1), loser(2)] },
        { series: 6, col: 1, row: 5.25, slots: [loser(3), loser(4)] },
        { series: 7, col: 1, row: 0.5, slots: [winner(1), winner(2)] },
        { series: 8, col: 1, row: 2.5, slots: [winner(3), winner(4)] },
        { series: 9, col: 2, row: 5.25, slots: [loser(7), winner(6)] },
        { series: 10, col: 2, row: 4.25, slots: [loser(8), winner(5)] },
        { series: 11, col: 2, row: 1.5, slots: [winner(7), winner(8)] },
        { series: 12, col: 3, row: 4.75, slots: [winner(9), winner(10)] },
        { series: 13, col: 4, row: 4.75, slots: [loser(11), winner(12)] },
    ],
    14,
    5,
    [11, 13]
);

export function bracketLayoutFor(allianceCount: number): BracketLayout | null {
    if (allianceCount == 4) return FOUR_ALLIANCES;
    if (allianceCount == 6) return SIX_ALLIANCES;
    if (allianceCount == 8) return EIGHT_ALLIANCES;
    return null;
}
