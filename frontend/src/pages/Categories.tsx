import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { Category } from '../types';

interface CategoryFormProps {
  category?: Category;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

function CategoryForm({ category, onSubmit, onCancel }: CategoryFormProps) {
  const [name, setName] = useState(category?.name || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(name);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">費目名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          required
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
        >
          キャンセル
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          {category ? '更新' : '追加'}
        </button>
      </div>
    </form>
  );
}

export function Categories() {
  const queryClient = useQueryClient();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categories(),
    queryFn: () => apiGet<Category[]>('/categories'),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiPost<Category>('/categories', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories() });
      setIsAdding(false);
      setError(null);
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.status === 409) {
        setError('同じ名前の費目が既に存在します');
      } else {
        setError('費目の作成に失敗しました');
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      apiPatch<Category>(`/categories/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories() });
      setEditingCategory(null);
      setError(null);
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.status === 409) {
        setError('同じ名前の費目が既に存在します');
      } else {
        setError('費目の更新に失敗しました');
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories() });
      setError(null);
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.status === 409) {
        setError('この費目は使用中のため削除できません');
      } else {
        setError('費目の削除に失敗しました');
      }
    },
  });

  const defaultCategories = categories.filter((c) => c.isDefault);
  const customCategories = categories.filter((c) => !c.isDefault);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">費目管理</h1>
        <button
          onClick={() => {
            setIsAdding(true);
            setError(null);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          費目を追加
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Add Form Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">費目を追加</h2>
            <CategoryForm
              onSubmit={(name) => createMutation.mutate(name)}
              onCancel={() => {
                setIsAdding(false);
                setError(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Edit Form Modal */}
      {editingCategory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">費目を編集</h2>
            <CategoryForm
              category={editingCategory}
              onSubmit={(name) => updateMutation.mutate({ id: editingCategory.id, name })}
              onCancel={() => {
                setEditingCategory(null);
                setError(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Custom Categories */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">カスタム費目</h2>
        {customCategories.length === 0 ? (
          <p className="text-gray-500">カスタム費目はありません</p>
        ) : (
          <div className="space-y-2">
            {customCategories.map((category) => (
              <div key={category.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="font-medium text-gray-800">{category.name}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingCategory(category);
                      setError(null);
                    }}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('この費目を削除しますか？')) {
                        deleteMutation.mutate(category.id);
                      }
                    }}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Default Categories */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">デフォルト費目</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {defaultCategories.map((category) => (
            <div key={category.id} className="py-2 px-3 bg-gray-50 rounded text-gray-700">
              {category.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
