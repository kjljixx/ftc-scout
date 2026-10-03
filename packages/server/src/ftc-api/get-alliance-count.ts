import { Season } from "@ftc-scout/common";
import { getFromFtcApi } from "./get-from-ftc-api";

export async function getAllianceCount(season: Season, eventCode: string): Promise<number> {
    let resp = await getFromFtcApi(`${season}/alliances/${eventCode}`);
    return typeof resp?.count == "number" ? resp.count : 0;
}
