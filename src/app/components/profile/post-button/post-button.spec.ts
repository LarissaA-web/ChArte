import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PostButton } from './post-button';

describe('PostButton', () => {
  let component: PostButton;
  let fixture: ComponentFixture<PostButton>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PostButton],
    }).compileComponents();

    fixture = TestBed.createComponent(PostButton);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
