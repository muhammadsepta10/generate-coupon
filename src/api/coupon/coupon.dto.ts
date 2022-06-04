import {ApiProperty} from "@nestjs/swagger"

export class generateCouponDTO {
    @ApiProperty()
    prefix?: string
    @ApiProperty()
    postfix?: string
    @ApiProperty()
    lengths: number
    @ApiProperty()
    char?: string
    @ApiProperty()
    count: number
    @ApiProperty()
    project: string
    @ApiProperty({
        enum: {alpha: "alpha", numeric: "numeric", alphanumeric: "alphanumeric"}
    })
    type: "alpha" | "numeric" | "alphanumeric"
}