import { usePushNotification } from '../hooks/usePushNotification';

const getPermissionLabel = (permission: NotificationPermission | 'unsupported'): string => {
  switch (permission) {
    case 'granted':
      return '許可済み';
    case 'denied':
      return '拒否';
    case 'default':
      return '未設定';
    case 'unsupported':
      return '非対応';
    default:
      return permission;
  }
};

const getPermissionColor = (permission: NotificationPermission | 'unsupported'): string => {
  switch (permission) {
    case 'granted':
      return 'text-green-600';
    case 'denied':
      return 'text-red-600';
    case 'default':
      return 'text-yellow-600';
    case 'unsupported':
      return 'text-gray-500';
    default:
      return 'text-gray-600';
  }
};

export function Settings() {
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  } = usePushNotification();

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">設定</h1>

      {/* Push Notification Settings */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">プッシュ通知</h2>

        {!isSupported ? (
          <div className="text-gray-500">
            <p>お使いのブラウザはプッシュ通知に対応していません。</p>
            <p className="text-sm mt-2">
              Chrome、Firefox、Edge、Safari などのモダンブラウザをお使いください。
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Permission Status */}
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div>
                <p className="font-medium text-gray-700">通知の許可状態</p>
                <p className="text-sm text-gray-500">ブラウザの通知許可設定</p>
              </div>
              <span className={`font-medium ${getPermissionColor(permission)}`}>
                {getPermissionLabel(permission)}
              </span>
            </div>

            {/* Subscription Toggle */}
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div>
                <p className="font-medium text-gray-700">OTP通知</p>
                <p className="text-sm text-gray-500">
                  スクレイピング中にOTP入力が必要な場合に通知を受け取ります
                </p>
              </div>
              <button
                onClick={handleToggle}
                disabled={isLoading || permission === 'denied'}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  isSubscribed ? 'bg-blue-600' : 'bg-gray-200'
                } ${isLoading || permission === 'denied' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isSubscribed ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Permission denied message */}
            {permission === 'denied' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <p className="text-yellow-800 text-sm">
                  通知がブロックされています。ブラウザの設定から通知を許可してください。
                </p>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {/* Success message */}
            {isSubscribed && !error && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <p className="text-green-800 text-sm">
                  プッシュ通知が有効です。OTP入力が必要な場合に通知を受け取ります。
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">OTP通知について</h2>
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            金融機関へのログイン時に二要素認証（OTP）が必要な場合、プッシュ通知でお知らせします。
          </p>
          <p>通知をタップすると、OTPコードを入力できるダイアログが表示されます。</p>
          <p>OTPの有効期限は5分間です。期限内に入力してください。</p>
        </div>
      </div>
    </div>
  );
}
