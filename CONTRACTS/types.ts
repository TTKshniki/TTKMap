export interface Item {
  id: string;
  title: string;
  created_at: string;
}

export interface CreateItemRequest {
  title: string;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
}
