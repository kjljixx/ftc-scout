import { BaseEntity, Column, Entity, ManyToOne, PrimaryColumn, UpdateDateColumn } from "typeorm";
import { PicklistTeam } from "./PicklistTeam";

export type CustomFieldType = "string" | "float" | "boolean";

export type CustomField = {
    id: string;
    name: string;
    type: CustomFieldType;
};

@Entity()
export class EventPicklist extends BaseEntity {
    @PrimaryColumn("char", { length: 64 })
    teamTokenHash!: string;

    @ManyToOne(() => PicklistTeam, { onDelete: "CASCADE" })
    team!: PicklistTeam;

    @PrimaryColumn()
    season!: number;

    @PrimaryColumn()
    eventCode!: string;

    @Column("int", { array: true })
    teamOrder!: number[];

    @Column("jsonb", { default: () => "'[]'" })
    customFields!: CustomField[];

    @Column("jsonb", { default: () => "'{}'" })
    customValues!: Record<string, Record<string, string | number | boolean>>;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;
}
