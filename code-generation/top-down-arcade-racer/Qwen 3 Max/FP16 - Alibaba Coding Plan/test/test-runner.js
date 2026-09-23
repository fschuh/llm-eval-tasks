// Comprehensive Test Runner
// This file runs all tests in the test suite and provides a summary

import { CoreEngineTest } from './core-engine-test.js';
import { PlayerCarTest } from './player-car-test.js';
import { AIOpponentTest } from './ai-opponent-test.js';
import { LapDetectionTest } from './lap-detection-test.js';
import { CollisionTest } from './collision-test.js';
import { HUDTest } from './hud-test.js';
import { DeterministicTest } from './deterministic-test.js';
import { IntegrationTest } from './integration-test.js';

class TestRunner {
    constructor() {
        this.tests = [
            { name: 'Core Game Engine', test: new CoreEngineTest() },
            { name: 'Player Car Physics', test: new PlayerCarTest() },
            { name: 'AI Opponents', test: new AIOpponentTest() },
            { name: 'Lap Detection', test: new LapDetectionTest() },
            { name: 'Collision Response', test: new CollisionTest() },
            { name: 'HUD System', test: new HUDTest() },
            { name: 'Deterministic RNG', test: new DeterministicTest() },
            { name: 'Integration & Performance', test: new IntegrationTest() }
        ];
        this.results = [];
    }
    
    async runAllTests() {
        console.log('🚀 Starting Comprehensive Racing Game Test Suite');
        console.log('='.repeat(60));
        
        let totalTests = 0;
        let passedTests = 0;
        let failedTests = 0;
        
        for (const testInfo of this.tests) {
            console.log(`\n📋 Running ${testInfo.name} Test...`);
            console.log('-'.repeat(40));
            
            try {
                const startTime = performance.now();
                const result = await this.runTest(testInfo.test);
                const endTime = performance.now();
                const duration = (endTime - startTime).toFixed(2);
                
                totalTests++;
                
                if (result) {
                    passedTests++;
                    console.log(`✅ ${testInfo.name} Test PASSED (${duration}ms)`);
                } else {
                    failedTests++;
                    console.log(`❌ ${testInfo.name} Test FAILED (${duration}ms)`);
                }
                
                this.results.push({
                    name: testInfo.name,
                    passed: result,
                    duration: parseFloat(duration)
                });
                
            } catch (error) {
                failedTests++;
                totalTests++;
                console.log(`💥 ${testInfo.name} Test ERROR: ${error.message}`);
                this.results.push({
                    name: testInfo.name,
                    passed: false,
                    duration: 0,
                    error: error.message
                });
            }
        }
        
        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST SUITE SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Tests: ${totalTests}`);
        console.log(`Passed: ${passedTests}`);
        console.log(`Failed: ${failedTests}`);
        console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        
        // Detailed results
        console.log('\n📋 DETAILED RESULTS:');
        for (const result of this.results) {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            const duration = result.duration ? ` (${result.duration}ms)` : '';
            console.log(`  ${status} ${result.name}${duration}`);
            if (result.error) {
                console.log(`    Error: ${result.error}`);
            }
        }
        
        console.log('\n' + '='.repeat(60));
        
        const allPassed = failedTests === 0;
        if (allPassed) {
            console.log('🎉 ALL TESTS PASSED! The racing prototype meets all requirements.');
        } else {
            console.log('⚠️  SOME TESTS FAILED! Please review the failures above.');
        }
        console.log('='.repeat(60));
        
        return allPassed;
    }
    
    async runTest(testInstance) {
        // Check if test has async runTest method
        if (testInstance.runTest.constructor.name === 'AsyncFunction') {
            return await testInstance.runTest();
        } else {
            return testInstance.runTest();
        }
    }
}

// Run the test suite if this file is executed directly
if (typeof window !== 'undefined') {
    window.TestRunner = TestRunner;
    
    // Auto-run when loaded in browser
    document.addEventListener('DOMContentLoaded', async () => {
        const runner = new TestRunner();
        await runner.runAllTests();
    });
} else {
    console.log('Test runner requires browser environment');
}

export { TestRunner };