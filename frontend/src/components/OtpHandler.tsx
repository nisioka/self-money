import { useOtpHandler } from '../hooks/useOtpHandler';
import { OtpDialog } from './OtpDialog';

export function OtpHandler() {
  const {
    isOpen,
    jobId,
    accountName,
    authMethod,
    remainingSeconds,
    retryCount,
    error,
    submitOtp,
    cancelOtp,
  } = useOtpHandler();

  return (
    <OtpDialog
      isOpen={isOpen}
      jobId={jobId ?? ''}
      accountName={accountName}
      authMethod={authMethod}
      remainingSeconds={remainingSeconds}
      retryCount={retryCount}
      onSubmit={submitOtp}
      onCancel={cancelOtp}
      error={error}
    />
  );
}
