import { Injectable, Logger } from '@nestjs/common';

export interface SavedView {
  id: string;
  userId: string;
  name: string;
  filters: Record<string, any>;
  sort?: { field: string; direction: 'asc' | 'desc' };
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class SavedViewsService {
  private readonly logger = new Logger(SavedViewsService.name);
  private views: Map<string, SavedView> = new Map();
  private counter = 0;

  createView(userId: string, name: string, filters: Record<string, any>, sort?: { field: string; direction: 'asc' | 'desc' }): SavedView {
    const id = `view-${++this.counter}`;
    const now = new Date().toISOString();
    const view: SavedView = { id, userId, name, filters, sort, createdAt: now, updatedAt: now };
    this.views.set(id, view);
    this.logger.log(`Created saved view id=${id} user=${userId} name=${name}`);
    return view;
  }

  getViewsForUser(userId: string): SavedView[] {
    return Array.from(this.views.values()).filter(v => v.userId === userId);
  }

  getView(id: string): SavedView | null {
    return this.views.get(id) || null;
  }

  updateView(id: string, updates: Partial<Pick<SavedView, 'name' | 'filters' | 'sort'>>): SavedView | null {
    const view = this.views.get(id);
    if (!view) return null;
    Object.assign(view, updates, { updatedAt: new Date().toISOString() });
    return view;
  }

  deleteView(id: string): boolean {
    return this.views.delete(id);
  }
}
