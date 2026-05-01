import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ScimController } from '../controllers/scim.controller';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('ScimController (FR-143.A3)', () => {
  let controller: ScimController;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  const mockUser = {
    id: 'user-001',
    email: 'john@example.com',
    full_name: 'John Doe',
    is_active: true,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-06-01'),
  };

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScimController],
      providers: [{ provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    controller = module.get(ScimController);
  });

  describe('GET /scim/v2/Users', () => {
    it('should list users in SCIM format', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await controller.listUsers();

      expect(result.schemas).toContain(
        'urn:ietf:params:scim:api:messages:2.0:ListResponse',
      );
      expect(result.totalResults).toBe(1);
      expect(result.Resources).toHaveLength(1);
      expect(result.Resources[0].userName).toBe('john@example.com');
      expect(result.Resources[0].id).toBe('user-001');
    });

    it('should support pagination via startIndex and count', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(50);

      const result = await controller.listUsers('11', '10');

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
      expect(result.startIndex).toBe(11);
      expect(result.itemsPerPage).toBe(10);
    });

    it('should support SCIM filter for userName', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);
      mockPrisma.user.count.mockResolvedValue(1);

      await controller.listUsers(undefined, undefined, 'userName eq "john@example.com"');

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'john@example.com' },
        }),
      );
    });
  });

  describe('GET /scim/v2/Users/:id', () => {
    it('should return a user in SCIM format', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await controller.getUser('user-001');

      expect(result.schemas).toContain(
        'urn:ietf:params:scim:schemas:core:2.0:User',
      );
      expect(result.userName).toBe('john@example.com');
      expect(result.name.formatted).toBe('John Doe');
      expect(result.emails[0].value).toBe('john@example.com');
      expect(result.active).toBe(true);
    });

    it('should throw NotFoundException for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(controller.getUser('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('POST /scim/v2/Users', () => {
    it('should create a user via SCIM', async () => {
      mockPrisma.user.create.mockResolvedValue({
        ...mockUser,
        id: 'new-user-id',
      });

      const result = await controller.createUser({
        userName: 'new@example.com',
        name: { formatted: 'New User' },
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'new@example.com',
          full_name: 'New User',
        },
      });
      expect(result.userName).toBe('john@example.com'); // from mock return
    });

    it('should throw BadRequestException when userName is missing', async () => {
      await expect(
        controller.createUser({ userName: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use givenName + familyName when formatted is absent', async () => {
      mockPrisma.user.create.mockResolvedValue(mockUser);

      await controller.createUser({
        userName: 'test@example.com',
        name: { givenName: 'Jane', familyName: 'Smith' },
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          full_name: 'Jane Smith',
        },
      });
    });
  });

  describe('PATCH /scim/v2/Users/:id', () => {
    it('should patch a user with active status change', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, is_active: false });

      const result = await controller.patchUser('user-001', {
        Operations: [
          { op: 'replace', path: 'active', value: false },
        ],
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-001' },
        data: { is_active: false },
      });
    });

    it('should throw NotFoundException for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        controller.patchUser('unknown', { Operations: [] }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('DELETE /scim/v2/Users/:id', () => {
    it('should delete a user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.delete.mockResolvedValue(mockUser);

      await controller.deleteUser('user-001');

      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-001' },
      });
    });

    it('should throw NotFoundException for unknown user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(controller.deleteUser('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
