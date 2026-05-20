import { useCallback, useState } from 'react';

// Imperative geolocation hook. Component calls request() on tap; we resolve
// to a coord, or surface an error message for a toast.
export function useGeolocation() {
  const [coord, setCoord] = useState(null);
  const [error, setError] = useState(null);
  const [requesting, setRequesting] = useState(false);

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError("Your browser doesn't support location.");
      return;
    }
    setRequesting(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRequesting(false);
        setCoord([pos.coords.latitude, pos.coords.longitude]);
      },
      (err) => {
        setRequesting(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location permission denied.');
        } else {
          setError("Couldn't get your location.");
        }
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { coord, error, requesting, request, clearError };
}
