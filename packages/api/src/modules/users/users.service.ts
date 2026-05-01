import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { UserRole } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  roles: UserRole[];
  region?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Omit<User, 'password'>[]> {
    const users = await this.prisma.user.findMany({
      where: { is_deleted: false },
      include: { user_roles: { include: { role: true }, where: { is_active: true } } },
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.full_name,
      roles: u.user_roles.map((ur) => ur.role.code as UserRole),
      region: u.region ?? undefined,
      isActive: u.is_active,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
    }));
  }

  async findById(id: string): Promise<Omit<User, 'password'>> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { user_roles: { include: { role: true }, where: { is_active: true } } },
    });

    if (!user || user.is_deleted) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return {
      id: user.id,
      email: user.email,
      name: user.full_name,
      roles: user.user_roles.map((ur) => ur.role.code as UserRole),
      region: user.region ?? undefined,
      isActive: user.is_active,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  async create(dto: CreateUserDto): Promise<Omit<User, 'password'>> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException(
        `User with email ${dto.email} already exists`,
      );
    }

    const user = await this.prisma.user.create({
      data: {
        full_name: dto.name,
        email: dto.email,
        password_hash: dto.password, // In production: hash this
        region: dto.region,
        is_active: true,
      },
    });

    // Assign roles if any
    if (dto.roles.length > 0) {
      const roles = await this.prisma.role.findMany({
        where: { code: { in: dto.roles } },
      });

      if (roles.length > 0) {
        await this.prisma.userRole.createMany({
          data: roles.map((r) => ({
            user_id: user.id,
            role_id: r.id,
            region: dto.region,
          })),
          skipDuplicates: true,
        });
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.full_name,
      roles: dto.roles,
      region: user.region ?? undefined,
      isActive: user.is_active,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  async update(id: string, dto: UpdateUserDto): Promise<Omit<User, 'password'>> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.is_deleted) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.name !== undefined && { full_name: dto.name }),
        ...(dto.password !== undefined && { password_hash: dto.password }),
        ...(dto.region !== undefined && { region: dto.region }),
      },
      include: { user_roles: { include: { role: true }, where: { is_active: true } } },
    });

    // Update roles if provided
    if (dto.roles !== undefined) {
      // Deactivate existing roles
      await this.prisma.userRole.updateMany({
        where: { user_id: id },
        data: { is_active: false },
      });

      // Assign new roles
      const roles = await this.prisma.role.findMany({
        where: { code: { in: dto.roles } },
      });

      if (roles.length > 0) {
        for (const r of roles) {
          await this.prisma.userRole.upsert({
            where: { user_id_role_id: { user_id: id, role_id: r.id } },
            update: { is_active: true, region: dto.region ?? existing.region },
            create: { user_id: id, role_id: r.id, region: dto.region ?? existing.region, is_active: true },
          });
        }
      }
    }

    const finalRoles = dto.roles ?? user.user_roles.map((ur) => ur.role.code as UserRole);

    return {
      id: user.id,
      email: user.email,
      name: user.full_name,
      roles: finalRoles,
      region: user.region ?? undefined,
      isActive: user.is_active,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }
}
