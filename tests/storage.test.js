import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SafeStorage } from '../public/src/utils/storage.js';

describe('SafeStorage', () => {
  const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', mockLocalStorage);
    mockLocalStorage.getItem.mockReset();
    mockLocalStorage.setItem.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gets item safely when localStorage works', () => {
    mockLocalStorage.getItem.mockReturnValue('test-value');
    const result = SafeStorage.getItem('test-key');
    expect(result).toBe('test-value');
    expect(mockLocalStorage.getItem).toHaveBeenCalledWith('test-key');
  });

  it('returns null when key does not exist in localStorage', () => {
    mockLocalStorage.getItem.mockReturnValue(null);
    const result = SafeStorage.getItem('non-existent-key');
    expect(result).toBeNull();
    expect(mockLocalStorage.getItem).toHaveBeenCalledWith('non-existent-key');
  });

  it('sets item safely when localStorage works', () => {
    SafeStorage.setItem('key', 'value');
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('key', 'value');
  });

  it('returns null when localStorage.getItem throws (e.g. disabled)', () => {
    mockLocalStorage.getItem.mockImplementation(() => {
      throw new Error('Access Denied');
    });
    const result = SafeStorage.getItem('key');
    expect(result).toBeNull();
  });

  it('fails silently when localStorage.setItem throws', () => {
    const error = new Error('Quota Exceeded');
    mockLocalStorage.setItem.mockImplementation(() => {
      throw error;
    });

    expect(() => SafeStorage.setItem('key', 'value')).not.toThrow();
  });

  it('returns null when accessing localStorage property itself throws SecurityError on getItem', () => {
    vi.stubGlobal('localStorage', {
      get getItem() {
        throw new Error('SecurityError: Access to localStorage is denied');
      }
    });

    const result = SafeStorage.getItem('key');
    expect(result).toBeNull();
  });

  it('fails silently when accessing localStorage property itself throws on setItem', () => {
    const error = new Error('SecurityError: Access to localStorage is denied');
    vi.stubGlobal('localStorage', {
      get setItem() {
        throw error;
      }
    });

    expect(() => SafeStorage.setItem('key', 'value')).not.toThrow();
  });
});
