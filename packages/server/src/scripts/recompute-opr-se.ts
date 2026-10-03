import "dotenv/config";
import { DATA_SOURCE } from "../db/data-source";
import { initDynamicEntities } from "../db/entities/dyn/init";
import { TeamEventParticipation } from "../db/entities/dyn/team-event-participation";
import { Event } from "../db/entities/Event";
import { Match } from "../db/entities/Match";
import { DESCRIPTORS_LIST, calculateTeamEventStats } from "@ftc-scout/common";

const OPR_TOLERANCE = 1e-6;

async function main() {
    let dryRun = process.argv.includes("--dry");
    let seasonArg = process.argv.find((a) => a.startsWith("--season="));
    let onlySeason = seasonArg ? +seasonArg.split("=")[1] : null;
    let onlyEvent = process.argv.find((a) => a.startsWith("--event="))?.split("=")[1] ?? null;
    console.info(
        `[recompute oprSe] config: dryRun=${dryRun} season=${onlySeason ?? "all"} event=${onlyEvent ?? "all"}`
    );

    await DATA_SOURCE.initialize();
    initDynamicEntities();

    let totals = { events: 0, teps: 0, withStdErr: 0, oprMismatches: 0, failedEvents: 0 };

    for (let descriptor of DESCRIPTORS_LIST) {
        let season = descriptor.season;
        if (onlySeason != null && season != onlySeason) continue;

        let events = await DATA_SOURCE.getRepository(Event).find({
            where: { season, ...(onlyEvent ? { code: onlyEvent } : {}) },
            select: ["season", "code", "remote"],
        });
        console.info(`[recompute oprSe] season ${season}: ${events.length} events`);

        for (let [i, event] of events.entries()) {
            try {
                let oldTeps = await TeamEventParticipation[season].findBy({
                    season,
                    eventCode: event.code,
                });
                if (!oldTeps.length) continue;

                let matches = await DATA_SOURCE.getRepository(Match)
                    .createQueryBuilder("m")
                    .where("m.event_season = :season AND m.event_code = :code", {
                        season,
                        code: event.code,
                    })
                    .leftJoinAndMapMany(
                        "m.scores",
                        `match_score_${season}`,
                        "ms",
                        "m.event_season = ms.season AND m.event_code = ms.event_code AND m.id = ms.match_id"
                    )
                    .leftJoinAndMapMany(
                        "m.teams",
                        "team_match_participation",
                        "tmp",
                        "m.event_season = tmp.season AND m.event_code = tmp.event_code AND m.id = tmp.match_id"
                    )
                    .getMany();
                let teamNumbers = [
                    ...new Set([
                        ...oldTeps.map((t) => t.teamNumber),
                        ...matches.flatMap((m: Match) => m.teams.map((t) => t.teamNumber)),
                    ]),
                ];
                let newTeps = calculateTeamEventStats(
                    season,
                    event.code,
                    event.remote,
                    matches.map((m: Match) => m.toFrontend()),
                    teamNumbers
                ) as any[];

                let oldByTeam = new Map(oldTeps.map((t) => [t.teamNumber, t]));
                let updates = [];
                for (let tep of newTeps) {
                    let old = oldByTeam.get(tep.teamNumber);
                    if (!old) continue;

                    let storedOpr = old.opr;
                    let oprDiffers = Object.entries(tep.opr).some(
                        ([k, v]) => Math.abs(Number(v) - Number(storedOpr[k])) > OPR_TOLERANCE
                    );
                    if (oprDiffers) totals.oprMismatches++;

                    totals.teps++;
                    if (Object.values(tep.oprSe).some((v) => v != null)) totals.withStdErr++;
                    updates.push({
                        season,
                        eventCode: event.code,
                        teamNumber: tep.teamNumber,
                        oprSe: tep.oprSe,
                    });
                }

                if (!dryRun) {
                    await TeamEventParticipation[season].save(updates, { chunk: 100 });
                }
                totals.events++;
                if ((i + 1) % 100 == 0) {
                    console.info(`[recompute oprSe] season ${season}: ${i + 1}/${events.length}`);
                }
            } catch (e) {
                totals.failedEvents++;
                console.error(`[recompute oprSe] FAILED ${season} ${event.code}:`, e);
            }
        }
    }

    console.info(`[recompute oprSe] done: ${JSON.stringify(totals)}`);
    if (totals.oprMismatches > 0) {
        console.warn(
            `[recompute oprSe] ${totals.oprMismatches} teps had stored OPR differing from the recomputed OPR (stored OPR was left untouched).`
        );
    }
    await DATA_SOURCE.destroy();
}

main();
