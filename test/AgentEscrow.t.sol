// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/AgentEscrow.sol";

contract AgentEscrowTest is Test {
    AgentEscrow public escrow;
    address public feeCollector = address(0xFEE);
    address public employer = address(0x1);
    address public worker = address(0x2);
    
    uint256 constant PAYMENT = 1 ether;
    uint256 constant SERVICE_FEE = 0.01 ether; // 1% of 1 ether
    uint256 constant WORKER_PAYMENT = 0.99 ether; // 99% of 1 ether

    event JobCreated(uint256 indexed jobId, address indexed employer, address indexed worker, uint256 amount, uint256 deadline);
    event WorkSubmitted(uint256 indexed jobId, string deliverable);
    event JobCompleted(uint256 indexed jobId, address worker, uint256 amount);
    event JobCancelled(uint256 indexed jobId, address employer, uint256 refund);
    event JobDisputed(uint256 indexed jobId, address indexed disputer);

    function setUp() public {
        escrow = new AgentEscrow(feeCollector);
        
        // Fund test accounts
        vm.deal(employer, 10 ether);
        vm.deal(worker, 1 ether);
    }

    function testCreateJob() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.expectEmit(true, true, true, true);
        emit JobCreated(0, employer, worker, PAYMENT, deadline);
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        assertEq(jobId, 0);
        
        AgentEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(job.employer, employer);
        assertEq(job.worker, worker);
        assertEq(job.amount, PAYMENT);
        assertEq(job.deadline, deadline);
        assertEq(uint(job.status), uint(AgentEscrow.JobStatus.Created));
    }

    function testCannotCreateJobWithZeroPayment() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        vm.expectRevert("Payment required");
        escrow.createJob{value: 0}(worker, deadline);
    }

    function testCannotCreateJobWithPastDeadline() public {
        // Set current time to avoid underflow
        vm.warp(2 days);
        uint256 deadline = block.timestamp - 1 days;
        
        vm.prank(employer);
        vm.expectRevert("Deadline must be in future");
        escrow.createJob{value: PAYMENT}(worker, deadline);
    }

    function testCannotHireSelf() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        vm.expectRevert("Cannot hire yourself");
        escrow.createJob{value: PAYMENT}(employer, deadline);
    }

    function testSubmitWork() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        string memory deliverable = "ipfs://QmTest123";
        
        vm.expectEmit(true, false, false, true);
        emit WorkSubmitted(jobId, deliverable);
        
        vm.prank(worker);
        escrow.submitWork(jobId, deliverable);
        
        AgentEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(job.deliverable, deliverable);
        assertEq(uint(job.status), uint(AgentEscrow.JobStatus.WorkSubmitted));
    }

    function testOnlyWorkerCanSubmitWork() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        vm.prank(employer);
        vm.expectRevert("Only worker can submit");
        escrow.submitWork(jobId, "ipfs://QmTest");
    }

    function testCannotSubmitWorkAfterDeadline() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        // Fast forward past deadline
        vm.warp(deadline + 1);
        
        vm.prank(worker);
        vm.expectRevert("Job expired");
        escrow.submitWork(jobId, "ipfs://QmTest");
    }

    function testApproveWorkAndPayment() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        vm.prank(worker);
        escrow.submitWork(jobId, "ipfs://QmTest");
        
        uint256 workerBalanceBefore = worker.balance;
        uint256 feeCollectorBalanceBefore = feeCollector.balance;
        
        vm.expectEmit(true, false, false, true);
        emit JobCompleted(jobId, worker, WORKER_PAYMENT);
        
        vm.prank(employer);
        escrow.approveWork(jobId);
        
        // Check balances
        assertEq(worker.balance, workerBalanceBefore + WORKER_PAYMENT);
        assertEq(feeCollector.balance, feeCollectorBalanceBefore + SERVICE_FEE);
        
        // Check job status
        AgentEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint(job.status), uint(AgentEscrow.JobStatus.Completed));
    }

    function testOnlyEmployerCanApprove() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        vm.prank(worker);
        escrow.submitWork(jobId, "ipfs://QmTest");
        
        vm.prank(worker);
        vm.expectRevert("Only employer can approve");
        escrow.approveWork(jobId);
    }

    function testCannotApproveWithoutWorkSubmitted() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        vm.prank(employer);
        vm.expectRevert("Work not submitted");
        escrow.approveWork(jobId);
    }

    function testCancelJobAfterDeadline() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        // Fast forward past deadline
        vm.warp(deadline + 1);
        
        uint256 employerBalanceBefore = employer.balance;
        
        vm.expectEmit(true, false, false, true);
        emit JobCancelled(jobId, employer, PAYMENT);
        
        vm.prank(employer);
        escrow.cancelJob(jobId);
        
        // Check refund
        assertEq(employer.balance, employerBalanceBefore + PAYMENT);
        
        // Check status
        AgentEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint(job.status), uint(AgentEscrow.JobStatus.Cancelled));
    }

    function testCannotCancelBeforeDeadline() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        vm.prank(employer);
        vm.expectRevert("Deadline not passed");
        escrow.cancelJob(jobId);
    }

    function testOnlyEmployerCanCancel() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        vm.warp(deadline + 1);
        
        vm.prank(worker);
        vm.expectRevert("Only employer can cancel");
        escrow.cancelJob(jobId);
    }

    function testDispute() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        vm.prank(worker);
        escrow.submitWork(jobId, "ipfs://QmTest");
        
        vm.expectEmit(true, true, false, false);
        emit JobDisputed(jobId, employer);
        
        vm.prank(employer);
        escrow.dispute(jobId);
        
        AgentEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint(job.status), uint(AgentEscrow.JobStatus.Disputed));
    }

    function testWorkerCanDispute() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        vm.expectEmit(true, true, false, false);
        emit JobDisputed(jobId, worker);
        
        vm.prank(worker);
        escrow.dispute(jobId);
        
        AgentEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint(job.status), uint(AgentEscrow.JobStatus.Disputed));
    }

    function testOnlyPartiesCanDispute() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        address thirdParty = address(0x3);
        vm.prank(thirdParty);
        vm.expectRevert("Only parties can dispute");
        escrow.dispute(jobId);
    }

    function testResolveDisputedJob() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        // Dispute the job
        vm.prank(employer);
        escrow.dispute(jobId);
        
        // Fast forward 7 days
        vm.warp(block.timestamp + 7 days + 1);
        
        uint256 employerBalanceBefore = employer.balance;
        
        // Resolve dispute
        vm.prank(employer);
        escrow.resolveDisputedJob(jobId);
        
        // Check refund
        assertEq(employer.balance, employerBalanceBefore + PAYMENT);
        
        // Check status
        AgentEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint(job.status), uint(AgentEscrow.JobStatus.Cancelled));
    }

    function testCannotResolveDisputeBeforeTimeout() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        vm.prank(employer);
        escrow.dispute(jobId);
        
        // Try to resolve before timeout
        vm.prank(employer);
        vm.expectRevert("Dispute period not ended");
        escrow.resolveDisputedJob(jobId);
    }

    function testOnlyEmployerCanResolveDispute() public {
        uint256 deadline = block.timestamp + 1 days;
        
        vm.prank(employer);
        uint256 jobId = escrow.createJob{value: PAYMENT}(worker, deadline);
        
        vm.prank(employer);
        escrow.dispute(jobId);
        
        vm.warp(block.timestamp + 7 days + 1);
        
        // Worker tries to resolve
        vm.prank(worker);
        vm.expectRevert("Only employer can resolve");
        escrow.resolveDisputedJob(jobId);
    }

    function testMultipleJobs() public {
        uint256 deadline = block.timestamp + 1 days;
        
        // Create 3 jobs
        vm.startPrank(employer);
        uint256 jobId1 = escrow.createJob{value: PAYMENT}(worker, deadline);
        uint256 jobId2 = escrow.createJob{value: PAYMENT}(worker, deadline);
        uint256 jobId3 = escrow.createJob{value: PAYMENT}(worker, deadline);
        vm.stopPrank();
        
        assertEq(jobId1, 0);
        assertEq(jobId2, 1);
        assertEq(jobId3, 2);
        
        // Complete job 2
        vm.prank(worker);
        escrow.submitWork(jobId2, "ipfs://QmTest2");
        
        vm.prank(employer);
        escrow.approveWork(jobId2);
        
        // Check job 2 completed while others remain open
        AgentEscrow.Job memory job1 = escrow.getJob(jobId1);
        AgentEscrow.Job memory job2 = escrow.getJob(jobId2);
        AgentEscrow.Job memory job3 = escrow.getJob(jobId3);
        
        assertEq(uint(job1.status), uint(AgentEscrow.JobStatus.Created));
        assertEq(uint(job2.status), uint(AgentEscrow.JobStatus.Completed));
        assertEq(uint(job3.status), uint(AgentEscrow.JobStatus.Created));
    }
}
