// 서버를 켜는 진입점이다.
// 카카오 열쇠는 환경변수 KAKAO_REST_API_KEY로만 읽는다.
package main

import (
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/VeritasForge/random-choice/api/internal/httpapi"
	"github.com/VeritasForge/random-choice/api/internal/kakao"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// 열쇠가 없으면 조회기를 만들지 않는다. 그러면 조회 요청은 not_configured로 답한다.
	// 서버 자체는 정상적으로 떠서, 무엇이 빠졌는지 응답으로 알 수 있다.
	var finder httpapi.PlaceFinder
	if key := os.Getenv("KAKAO_REST_API_KEY"); key != "" {
		finder = kakao.NewClient(key)
	} else {
		slog.Warn("KAKAO_REST_API_KEY가 없습니다. 조회 요청은 not_configured로 응답합니다")
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           httpapi.NewHandler(finder),
		ReadHeaderTimeout: 5 * time.Second,
	}

	slog.Info("서버를 시작합니다", "addr", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("서버가 멈췄습니다", "error", err)
		os.Exit(1)
	}
}
