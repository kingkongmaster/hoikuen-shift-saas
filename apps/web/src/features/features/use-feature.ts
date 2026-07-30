import { useEffect, useMemo, useState } from 'react';
import { api, type FeatureCode } from '../../api/client';

export function hasFeature(features: readonly FeatureCode[], feature: FeatureCode) { return features.includes(feature); }

export function useFeature(token: string, feature: FeatureCode) {
  const [features, setFeatures] = useState<FeatureCode[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void api.features(token).then((response) => { if (active) setFeatures(response.enabledFeatures); }).catch(() => { if (active) setFeatures([]); }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [token]);
  return useMemo(() => ({ enabled: hasFeature(features, feature), loaded }), [features, feature, loaded]);
}
