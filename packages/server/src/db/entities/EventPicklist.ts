import { BaseEntity, Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class EventPicklist extends BaseEntity {
    @PrimaryColumn()
    season!: number;

    @PrimaryColumn()
    eventCode!: string;

    @Column("int", { array: true })
    teamOrder!: number[];

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;
}
