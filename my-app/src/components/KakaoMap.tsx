import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    kakao: {
      maps: {
        load: (callback: () => void) => void;
        Map: new (container: HTMLElement, options: any) => any;
        LatLng: new (lat: number, lng: number) => any;
        Marker: new (options: any) => any;
        InfoWindow: new (options: any) => any;
        event: {
          addListener: (target: any, type: string, handler: () => void) => void;
        };
        services: {
          Geocoder: new () => any;
          Places: new () => any;
          Status: {
            OK: string;
          };
        };
      };
    };
  }
}

type ShopItem = {
  title: string;
  address: string;
  telephone: string;
};

const KakaoMap = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [shopList, setShopList] = useState<ShopItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 카카오맵 API 키 (환경변수 사용 권장)
  const KAKAO_API_KEY = import.meta.env.VITE_KAKAO_MAP_API_KEY || 'f0e87511135b2634f5cb772a7119bfd5';

  useEffect(() => {
    // ① shop_list.json 불러오기
    fetch('/shop_list.json')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data: ShopItem[]) => {
        setShopList(data);
        console.log('Shop list 로드 완료:', data.length, '개');
      })
      .catch((err) => {
        console.error('shop_list.json 로드 실패:', err);
        setError('매장 목록 로드에 실패했습니다.');
      });
  }, []);

  const initializeMap = () => {
    console.log('지도 초기화 시작');
    
    // API 로드 확인
    if (!window.kakao?.maps?.Map || !window.kakao?.maps?.LatLng) {
      console.error('카카오맵 API가 제대로 로드되지 않았습니다.');
      setError('지도 API 로드에 실패했습니다.');
      setIsLoading(false);
      return;
    }

    const mapContainer = mapRef.current;
    if (!mapContainer) {
      console.error('맵 컨테이너를 찾을 수 없습니다.');
      setError('지도 컨테이너를 찾을 수 없습니다.');
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        console.log('사용자 위치:', userLat, userLng);

        try {
          const { kakao } = window;
          const map = new kakao.maps.Map(mapContainer, {
            center: new kakao.maps.LatLng(userLat, userLng),
            level: 4,
          });

          const geocoder = new kakao.maps.services.Geocoder();

          // 내 위치 마커
          const userMarker = new kakao.maps.Marker({
            map,
            position: new kakao.maps.LatLng(userLat, userLng),
          });

          const infoWindow = new kakao.maps.InfoWindow({
            content: `<div style="padding:6px;font-size:13px;font-weight:bold;color:#333;">📍 현재 위치</div>`,
          });
          infoWindow.open(map, userMarker);

          // ② shop_list 기반 마커 생성
          let successCount = 0;
          let failCount = 0;

          const searchAddress = (place: ShopItem, index: number) => {
            // 주소 정제 함수
            const cleanAddress = (address: string) => {
              return address
                .replace(/\s+/g, ' ') // 여러 공백을 하나로
                .replace(/[()]/g, '') // 괄호 제거
                .replace(/\d+층.*$/, '') // "3층" 등 층수 정보 제거
                .replace(/\d+호.*$/, '') // "101호" 등 호수 정보 제거
                .trim();
            };

            const originalAddress = place.address;
            const cleanedAddress = cleanAddress(originalAddress);
            
            // 1차 시도: 원본 주소
            geocoder.addressSearch(originalAddress, (result: any, status: any) => {
              if (status === kakao.maps.services.Status.OK && result.length > 0) {
                createMarker(place, result[0]);
                successCount++;
                checkComplete();
              } else {
                // 2차 시도: 정제된 주소
                geocoder.addressSearch(cleanedAddress, (result: any, status: any) => {
                  if (status === kakao.maps.services.Status.OK && result.length > 0) {
                    createMarker(place, result[0]);
                    successCount++;
                    checkComplete();
                  } else {
                    // 3차 시도: 키워드 검색
                    const ps = new kakao.maps.services.Places();
                    ps.keywordSearch(place.title, (data: any, status: any) => {
                      if (status === kakao.maps.services.Status.OK && data.length > 0) {
                        createMarker(place, data[0]);
                        successCount++;
                        console.log(`키워드 검색 성공: ${place.title}`);
                      } else {
                        console.warn(`모든 검색 실패: ${place.title} - 원본주소: "${originalAddress}" / 정제주소: "${cleanedAddress}"`);
                        failCount++;
                      }
                      checkComplete();
                    });
                  }
                });
              }
            });
          };

          const createMarker = (place: ShopItem, location: any) => {
            const coords = new kakao.maps.LatLng(location.y, location.x);

            const marker = new kakao.maps.Marker({
              map,
              position: coords,
            });

            const info = new kakao.maps.InfoWindow({
              content: `<div style="padding:8px;font-size:13px;min-width:150px;">
                <strong style="color:#333;">${place.title}</strong><br/>
                <span style="color:#666;font-size:12px;">${place.telephone}</span><br/>
                <span style="color:#999;font-size:11px;">${place.address}</span>
              </div>`,
            });

            kakao.maps.event.addListener(marker, 'click', () => {
              info.open(map, marker);
            });
          };

          const checkComplete = () => {
            if (successCount + failCount === shopList.length) {
              setIsLoading(false);
              console.log(`마커 생성 완료: 성공 ${successCount}개, 실패 ${failCount}개`);
              if (failCount > 0) {
                console.log('실패한 매장들의 주소를 확인해보세요. 정확한 도로명주소나 지번주소가 필요합니다.');
              }
            }
          };

          shopList.forEach((place, index) => {
            // 각 요청 사이에 약간의 딜레이 추가 (API 요청 제한 방지)
            setTimeout(() => searchAddress(place, index), index * 150);
          });

          // shopList가 비어있는 경우 로딩 해제
          if (shopList.length === 0) {
            setIsLoading(false);
          }

        } catch (err) {
          console.error('지도 초기화 중 오류:', err);
          setError('지도 초기화에 실패했습니다.');
          setIsLoading(false);
        }
      },
      (err) => {
        console.error('위치 정보 접근 실패:', err);
        // 위치 접근 실패 시 부산 중심으로 지도 표시
        const defaultLat = 35.1796;
        const defaultLng = 129.0756;
        
        try {
          const { kakao } = window;
          const map = new kakao.maps.Map(mapRef.current!, {
            center: new kakao.maps.LatLng(defaultLat, defaultLng),
            level: 8,
          });

          // 기본 위치에 마커 표시
          const defaultMarker = new kakao.maps.Marker({
            map,
            position: new kakao.maps.LatLng(defaultLat, defaultLng),
          });

          const defaultInfo = new kakao.maps.InfoWindow({
            content: `<div style="padding:6px;font-size:13px;">📍 부산 (기본 위치)</div>`,
          });
          defaultInfo.open(map, defaultMarker);

          setIsLoading(false);
          setError('위치 접근 권한이 거부되어 기본 위치로 표시됩니다.');
        } catch (mapErr) {
          console.error('기본 지도 생성 실패:', mapErr);
          setError('지도를 표시할 수 없습니다.');
          setIsLoading(false);
        }
      }
    );
  };

  useEffect(() => {
    if (shopList.length === 0) return;

    // 이미 스크립트가 로드되어 있는지 확인
    const existingScript = document.querySelector('script[src*="dapi.kakao.com"]');
    if (existingScript) {
      if (window.kakao?.maps) {
        window.kakao.maps.load(initializeMap);
      } else {
        setTimeout(() => window.kakao.maps.load(initializeMap), 100);
      }
      return;
    }

    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_API_KEY}&libraries=services&autoload=false`;
    script.async = true;

    script.onload = () => {
      console.log('카카오맵 스크립트 로드 완료');
      if (window.kakao?.maps) {
        window.kakao.maps.load(initializeMap);
      } else {
        setTimeout(() => {
          if (window.kakao?.maps) {
            window.kakao.maps.load(initializeMap);
          } else {
            console.error('카카오맵 API 로드 실패');
            setError('지도 API 로드에 실패했습니다.');
            setIsLoading(false);
          }
        }, 200);
      }
    };

    script.onerror = () => {
      console.error('카카오맵 스크립트 로드 실패');
      setError('지도 스크립트 로드에 실패했습니다.');
      setIsLoading(false);
    };

    document.head.appendChild(script);

    return () => {
      // cleanup
      const scriptToRemove = document.querySelector('script[src*="dapi.kakao.com"]');
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
    };
  }, [shopList, KAKAO_API_KEY]);

  if (error) {
    return (
      <div style={{ 
        width: '100%', 
        height: '600px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        border: '1px solid #ddd',
        borderRadius: '8px',
        color: '#666'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>⚠️</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '600px' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '18px', marginBottom: '8px' }}>🗺️</div>
            <div>지도를 불러오고 있습니다...</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KakaoMap;