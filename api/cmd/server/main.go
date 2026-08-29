// 서버를 켜는 진입점이다.
// 카카오 열쇠는 환경변수 KAKAO_REST_API_KEY로만 읽는다.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/VeritasForge/random-choice/api/internal/httpapi"
	"github.com/VeritasForge/random-choice/api/internal/kakao"
)

// 세 시간값은 서로 맞물려 있다. 카카오 조회 상한(12초, kakao 패키지의 defaultSearchTimeout)이
// 가장 안쪽이고, 그것을 감싸는 응답 쓰기 상한, 그것을 감싸는 종료 대기 순으로 커야 한다.
//
// 순서가 뒤집히면 정상 종료가 제 일을 못 한다 — 종료 대기가 쓰기 상한보다 짧으면,
// 아직 살아 있어도 되는 요청을 Shutdown이 시간 초과로 판정해 그대로 끊는다.
const (
	writeTimeout    = 20 * time.Second
	shutdownTimeout = 25 * time.Second
	idleTimeout     = 60 * time.Second
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
		Handler:           httpapi.NewHandler(finder),
		ReadHeaderTimeout: 5 * time.Second,
		// 응답을 천천히 읽는(또는 읽지 않는) 상대가 연결과 고루틴을 무기한 붙잡지 못하게 한다.
		WriteTimeout: writeTimeout,
		IdleTimeout:  idleTimeout,
	}

	addr := ":" + port
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		slog.Error("포트를 열지 못했습니다", "addr", addr, "error", err)
		os.Exit(1)
	}

	// 종료 신호를 받으면 듣기를 멈추고, 진행 중인 요청이 끝날 때까지 기다린다.
	// 이것이 없으면 배포·재시작 때 처리 중이던 요청이 그대로 끊긴다.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	slog.Info("서버를 시작합니다", "addr", addr)
	if err := run(ctx, server, listener, stop); err != nil {
		slog.Error("서버가 멈췄습니다", "error", err)
		os.Exit(1)
	}
	slog.Info("서버를 정상적으로 종료했습니다")
}

// run은 서버를 돌리다가 ctx가 끝나면 정상 종료한다.
// main에서 떼어 둔 이유는 시험에서 신호 없이 이 동작을 확인하기 위해서다.
// onShutdown은 종료를 시작할 때 한 번 불린다(신호 처리를 기본 동작으로 되돌리는 용도).
func run(ctx context.Context, server *http.Server, listener net.Listener, onShutdown func()) error {
	serverErr := make(chan error, 1)
	go func() {
		serverErr <- server.Serve(listener)
	}()

	select {
	case err := <-serverErr:
		// Serve가 스스로 멈춘 경우. 리스너가 닫혔을 때 등이다.
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-ctx.Done():
		if onShutdown != nil {
			// 두 번째 신호는 기다리지 않고 바로 죽도록 기본 동작으로 되돌린다.
			onShutdown()
		}
		slog.Info("종료 신호를 받았습니다. 진행 중인 요청을 기다립니다",
			"timeout", shutdownTimeout)

		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	}
}
