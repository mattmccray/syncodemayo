export interface CLIOptions {
    verbose: boolean;
    force: boolean;
    stage: string;
    config?: string;
}
/**
 * Check ensures that the server is setup to sync
 */
export declare function check(options: Partial<CLIOptions>): Promise<any>;
/**
 * Initialize server to support sync
 */
export declare function init(options: Partial<CLIOptions>): Promise<any>;
/**
 * Display list of changed files
 */
export declare function changed(options: Partial<CLIOptions>): Promise<any>;
/**
 * Syncronize local and remote files via FTP
 */
export declare function run(options: Partial<CLIOptions>): Promise<any>;
export declare function listTargets(options: Partial<CLIOptions>): Promise<void>;
