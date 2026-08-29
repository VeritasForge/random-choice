// 서버를 켜는 진입점이다.
// 카카오 열쇠는 환경변수 KAKAO_REST_API_KEY로만 읽는다.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/VeritasForge/random-choice/api/internal/httpapi"
	"github.com/VeritasForge/random-choice/api/internal/kakao"
)

// shutdownTimeout은 종료 신호를 받은 뒤 진행 중인 요청을 기다려 주는 시간이다.
// 한 요청이 카카오 조회에 최대 12초까지 쓸 수 있으므로 그보다 넉넉히 잡는다.
const shutdownTimeout = 20 * time.Second

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
		// 응답을 천천히 읽는(또는 읽지 않는) 상대가 연결과 고루틴을 무기한
		// 붙잡지 못하게 한다. 카카오 조회 상한(12초)보다 넉넉해야 정상 요청이 잘리지 않는다.
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 종료 신호를 받으면 듣기를 멈추고, 진행 중인 요청이 끝날 때까지 기다린다.
	// 이것이 없으면 배포·재시작 때 처리 중이던 요청이 그대로 끊긴다.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serverErr := make(chan error, 1)
	go func() {
		slog.Info("서버를 시작합니다", "addr", server.Addr)
		serverErr <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErr:
		// ListenAndServe가 스스로 멈춘 경우. 포트를 이미 쓰고 있을 때 등이다.
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("서버가 멈췄습니다", "error", err)
			os.Exit(1)
		}
	case <-ctx.Done():
		stop() // 두 번째 신호는 기다리지 않고 바로 죽도록 기본 동작으로 되돌린다.
		slog.Info("종료 신호를 받았습니다. 진행 중인 요청을 기다립니다",
			"timeout", shutdownTimeout)

		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			slog.Error("정상 종료에 실패했습니다", "error", err)
			os.Exit(1)
		}
		slog.Info("서버를 정상적으로 종료했습니다")
	}
}
