import { Season } from "@ftc-scout/common";
import { BaseEntity, Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class MatchVideoTimestamp extends BaseEntity {
    @PrimaryColumn("smallint")
    season!: Season;

    @PrimaryColumn()
    eventCode!: string;

    @PrimaryColumn("int")
    matchId!: number;

    @PrimaryColumn()
    videoId!: string;

    @Column("int")
    startSeconds!: number;

    @Column("smallint")
    frames!: number;

    @Column("smallint")
    agreeingFrames!: number;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;
}
