use std::sync::Once;

static LOGGING_INIT: Once = Once::new();

pub fn init_logging() {
    LOGGING_INIT.call_once(|| {
        env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
            .format_target(false)
            .init();
    });
}
