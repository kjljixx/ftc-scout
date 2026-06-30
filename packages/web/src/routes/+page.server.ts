import { HOME_TEAM_COOKIE_NAME } from "$lib/constants";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ cookies }) => {
    let homeTeamStr = cookies.get(HOME_TEAM_COOKIE_NAME);
    let homeTeam = homeTeamStr ? +homeTeamStr : 10098;
    return { homeTeam };
};
