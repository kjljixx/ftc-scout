import { Season } from "@ftc-scout/common";
import { BaseEntity, Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class EventVideo extends BaseEntity {
    @PrimaryColumn("smallint")
    season!: Season;

    @PrimaryColumn()
    eventCode!: string;

    @PrimaryColumn()
    videoId!: string;

    @Column("timestamptz")
    wallStart!: Date;

    // Null while the video is still a live stream.
    @Column("int", { nullable: true })
    durationS!: number | null;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;
}
