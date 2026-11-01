import type { ComponentProps } from "svelte";
import type TeamsList from "./TeamsList.svelte";

const SAMPLE_TEAMS = [
    { number: 16072, name: "Quantum Quacks", city: "Holly Springs", state: "NC", country: "USA" },
    { number: 8802, name: "Circuit Breakers", city: "Raleigh", state: "NC", country: "USA" },
    { number: 19044, name: "Null Pointers", city: "Fairfax", state: "VA", country: "USA" },
    { number: 6001, name: "The Hexagons", city: "Pittsburgh", state: "PA", country: "USA" },
    { number: 2901, name: "Purple Gears", city: "San Jose", state: "CA", country: "USA" },
    { number: 30369, name: "Voltz", city: "Toronto", state: "ON", country: "Canada" },
];

export const SAMPLE_TEAM_ROWS = Array.from({ length: 24 }, (_, i) => {
    const { city, state, country, ...team } = SAMPLE_TEAMS[i % SAMPLE_TEAMS.length];
    return {
        document: { ...team, number: team.number + Math.floor(i / SAMPLE_TEAMS.length), location: { city, state, country } },
        highlights: [],
    };
}) as unknown as ComponentProps<TeamsList>["rows"];
