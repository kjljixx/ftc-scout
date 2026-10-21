import { BaseEntity, Column, CreateDateColumn, Entity, ManyToOne, PrimaryColumn } from "typeorm";
import { Team } from "./Team";

// Holder of the team link. Only the SHA-256 hex of the token is stored, so holding the token
// is the only way to reach the picklists below it.
@Entity()
export class PicklistTeam extends BaseEntity {
    @PrimaryColumn("char", { length: 64 })
    tokenHash!: string;

    @ManyToOne(() => Team)
    team!: Team;

    @Column("int")
    teamNumber!: number;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;
}
