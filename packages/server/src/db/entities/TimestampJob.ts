import { Season } from "@ftc-scout/common";
import { BaseEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export const TimestampJobStatus = {
    Queued: "Queued",
    Running: "Running",
    Done: "Done",
    Failed: "Failed",
} as const;
export type TimestampJobStatus = (typeof TimestampJobStatus)[keyof typeof TimestampJobStatus];

@Entity()
export class TimestampJob extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column("smallint")
    season!: Season;

    @Column()
    eventCode!: string;

    @Column()
    videoId!: string;

    @Index()
    @Column("enum", {
        enum: TimestampJobStatus,
        enumName: "timestamp_job_status_enum",
        default: TimestampJobStatus.Queued,
    })
    status!: TimestampJobStatus;

    @Column("int", { nullable: true })
    matchesFound!: number | null;

    @Column("text", { nullable: true })
    error!: string | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @Column("timestamptz", { nullable: true })
    startedAt!: Date | null;

    @Column("timestamptz", { nullable: true })
    finishedAt!: Date | null;
}
