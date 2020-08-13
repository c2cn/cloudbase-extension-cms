import {
    Post,
    Body,
    Get,
    Query,
    Delete,
    Param,
    Put,
    Controller,
    UseInterceptors,
    ClassSerializerInterceptor,
    UseGuards,
} from '@nestjs/common'
import _ from 'lodash'
import { CloudBaseService } from '@/dynamic_modules'
import { CollectionV2 } from '@/constants'
import { IsNotEmpty } from 'class-validator'
import { genPassword, dateToNumber } from '@/utils'
import { RecordExistException, RecordNotExistException } from '@/common'
import { Roles } from '@/common/decorators'
import { PermissionGuard } from '@/guards'

class User {
    @IsNotEmpty()
    username: string

    @IsNotEmpty()
    password: string

    @IsNotEmpty()
    roles: string[]

    // 兼容老版本，将 userName 转换成 username
    userName?: string

    // 创建时间
    createTime: number

    // 登陆失败次数
    failedLogins?: Record<string, number>[]
}

@UseGuards(PermissionGuard('user', ['administrator']))
@Controller('user')
export class UserController {
    constructor(private readonly cloudbaseService: CloudBaseService) {}

    @UseInterceptors(ClassSerializerInterceptor)
    @Get()
    async getUsers(@Query() query: { page?: number; pageSize?: number } = {}) {
        const { page = 1, pageSize = 20 } = query

        let { data, requestId } = await this.cloudbaseService
            .collection(CollectionV2.Users)
            .where({})
            .skip(Number(page - 1) * Number(pageSize))
            .limit(Number(pageSize))
            .get()

        // 兼容老版本，将 userName 转换成 username
        data = data.map((_) => ({
            ..._,
            username: _.username || _.userName,
        }))

        return {
            data,
            requestId,
        }
    }

    @Post()
    async createUser(@Body() body: User) {
        // 检查集合是否存在
        const { data } = await this.cloudbaseService
            .collection(CollectionV2.Users)
            .where({
                username: body.username,
            })
            .get()

        if (data?.length) {
            throw new RecordExistException()
        }

        body.createTime = dateToNumber()
        body.password = await genPassword(body.password, body.createTime)

        return this.cloudbaseService.collection(CollectionV2.Users).add(body)
    }

    @Put(':id')
    async updateProject(@Param('id') id: string, @Body() payload: Partial<User>) {
        const query = this.cloudbaseService.collection(CollectionV2.Users).doc(id)
        const { data } = await query.get()
        if (!data?.length) {
            throw new RecordNotExistException()
        }

        // 加密
        if (payload.password) {
            payload.password = await genPassword(payload.password, data?.[0].createTime)
        }

        // 不允许修改创建时间
        const user = _.omit(payload, ['createTime', '_createTime'])
        return query.update(user)
    }

    @Delete(':id')
    async deleteUser(@Param('id') userId) {
        return this.cloudbaseService.collection(CollectionV2.Users).doc(userId).remove()
    }
}