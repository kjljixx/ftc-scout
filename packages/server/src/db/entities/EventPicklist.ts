import { BaseEntity, Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

export type CustomFieldType = "string" | "float" | "boolean";

export type CustomField = {
    id: string;
    name: string;
    type: CustomFieldType;
};

@Entity()
export class EventPicklist extends BaseEntity {
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
